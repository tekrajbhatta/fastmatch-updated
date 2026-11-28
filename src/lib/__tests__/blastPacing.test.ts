import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isTemporaryRefusal, retryDelayMs, withTemporaryRetry, MAX_RETRY_WAIT_MS } from '@/lib/emails/retry';
import { blastEmailsPer30s, blastGapMs, takeSlot, DEFAULT_BLAST_EMAILS_PER_30S } from '@/lib/campaigns/pacing';
import { blamesOurSending } from '@/lib/mailgunWebhook';

const sendMail = vi.hoisted(() => vi.fn());
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }));

/**
 * 27-28 Nov 2026: 77 blast emails never reached Mailgun. It refuses more than
 * 26 recipients in 30 seconds ("421 … recipient limit (26) exceeded, try
 * again after …"), blasts went out about 3 a second, and a refused email was
 * counted as failed instead of being tried again.
 */

// Mailgun's answer, word for word (one of the 77).
const MAILGUN_421 = Object.assign(
  new Error('Message failed: 421 Domain mg.fastmatch.com.au is not allowed to send: recipient limit (26) exceeded, try again after Fri, 27 Nov 2026 22:51:41 UTC'),
  { code: 'EMESSAGE', responseCode: 421, command: 'DATA' },
);

describe('a "try again later" answer', () => {
  it('is any 4xx from the mail server, and nothing else', () => {
    expect(isTemporaryRefusal(MAILGUN_421)).toBe(true);
    expect(isTemporaryRefusal({ responseCode: 451 })).toBe(true);
    expect(isTemporaryRefusal({ responseCode: 550, command: 'RCPT TO' })).toBe(false); // a dead address
    expect(isTemporaryRefusal({ code: 'ECONNECTION' })).toBe(false); // may have gone: not retried
    expect(isTemporaryRefusal({ code: 'ETIMEDOUT' })).toBe(false);
    expect(isTemporaryRefusal(null)).toBe(false);
  });

  it('waits until the moment Mailgun gives, a second over', () => {
    const at = Date.parse('2026-11-27T22:51:41Z');
    expect(retryDelayMs(MAILGUN_421, at - 20_000)).toBe(21_000);
    expect(retryDelayMs(MAILGUN_421, at - 2_000)).toBe(3_000);
  });

  it('never waits under a second or over 35 seconds, and 30 when no time is given', () => {
    const at = Date.parse('2026-11-27T22:51:41Z');
    expect(retryDelayMs(MAILGUN_421, at + 60_000)).toBe(1_000); // that moment has passed
    expect(retryDelayMs(MAILGUN_421, at - 10 * 60_000)).toBe(MAX_RETRY_WAIT_MS);
    expect(retryDelayMs({ responseCode: 450, message: '450 Mailbox busy' })).toBe(30_000);
  });

  it('is tried again after the wait, up to the number of tries asked for', async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => { waits.push(ms); };
    let calls = 0;
    const result = await withTemporaryRetry(async () => { calls++; if (calls < 3) throw MAILGUN_421; return 'sent'; }, { attempts: 4, sleep });
    expect(result).toBe('sent');
    expect(calls).toBe(3);
    expect(waits).toHaveLength(2);

    calls = 0;
    await expect(withTemporaryRetry(async () => { calls++; throw MAILGUN_421; }, { attempts: 2, sleep })).rejects.toBe(MAILGUN_421);
    expect(calls).toBe(2);
  });

  it('is not tried again for a dead address or a dropped connection', async () => {
    const sleep = vi.fn(async () => {});
    for (const err of [{ responseCode: 550, command: 'RCPT TO' }, { code: 'ECONNECTION' }]) {
      let calls = 0;
      await expect(withTemporaryRetry(async () => { calls++; throw err; }, { attempts: 4, sleep })).rejects.toBe(err);
      expect(calls).toBe(1);
    }
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe('sendEmail tries again after a "try again later" answer', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse('2026-11-27T22:51:30Z') });
    process.env.MAILGUN_SMTP_USER = 'user';
    process.env.MAILGUN_SMTP_PASS = 'pass';
    sendMail.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.env = { ...saved };
  });

  it('once by default (a person may be waiting), then goes', async () => {
    sendMail.mockRejectedValueOnce(MAILGUN_421).mockResolvedValueOnce({});
    const { sendEmail } = await import('@/lib/emails/send');
    const sending = sendEmail({ to: 'olivia@example.com', subject: 'Hi', html: '<p>Hi</p>' });
    await vi.advanceTimersByTimeAsync(12_000); // Mailgun said 22:51:41: 11 s + 1
    await expect(sending).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('still refused after its tries: fails as before, with the answer kept', async () => {
    sendMail.mockRejectedValue(MAILGUN_421);
    const { sendEmail } = await import('@/lib/emails/send');
    const sending = sendEmail({ to: 'olivia@example.com', subject: 'Hi', html: '<p>Hi</p>', attempts: 3 });
    const outcome = sending.catch((e) => e);
    await vi.advanceTimersByTimeAsync(80_000);
    const err = await outcome;
    expect(err).toMatchObject({ responseCode: 421, command: 'DATA' });
    expect(sendMail).toHaveBeenCalledTimes(3);
  });
});

describe('blast pacing', () => {
  it('20 blast emails in 30 seconds unless BLAST_EMAILS_PER_30S says otherwise: one every 1.5 s', () => {
    expect(blastEmailsPer30s(undefined)).toBe(DEFAULT_BLAST_EMAILS_PER_30S);
    expect(DEFAULT_BLAST_EMAILS_PER_30S).toBeLessThan(26); // under Mailgun's limit, with room for other emails
    expect(blastGapMs(20)).toBe(1500);
    expect(blastEmailsPer30s('24')).toBe(24);
    for (const bad of ['', '0', '-5', '2.5', 'fast', '5000']) expect(blastEmailsPer30s(bad)).toBe(DEFAULT_BLAST_EMAILS_PER_30S);
  });

  it('a turn is the next free moment, or now if that has passed', () => {
    const now = new Date('2026-11-29T00:00:00Z');
    expect(takeSlot(new Date('2026-11-29T00:00:01.500Z'), now).toISOString()).toBe('2026-11-29T00:00:01.500Z');
    expect(takeSlot(new Date('2026-11-28T23:00:00Z'), now)).toBe(now);
    expect(takeSlot(null, now)).toBe(now);
  });
});

describe('blamesOurSending: failures that are about our sending, not the address', () => {
  it('the four members wrongly marked bounced on 27-28 Nov (no MX record), and other sender problems', () => {
    for (const reason of [
      '5.7.1 Sender rejected bounce+f8f9c3.3cf2927-x=bigpond.com@mg.fastmatch.com.au.\n5.7.1 IB300 i{0e5b2278-13ef-4a7c-8fd0-a2c06e472b88}',
      'sorry, refused mailfrom because return MX does not exist',
      '550 5.7.26 Unauthenticated email from fastmatch.com.au is not accepted due to its DMARC policy',
      '550 5.7.1 Messages from 204.220.184.31 weren\'t sent. Please contact your Internet service provider since part of their network is on our block list (S3150)',
      '554 5.7.9 Message not accepted for policy reasons',
      '550 5.7.1 Our system has detected that this message is likely unsolicited mail',
      'Message rejected as spam',
      'Client host blocked using Spamhaus',
    ]) expect(blamesOurSending(reason), reason).toBe(true);
  });

  it('every other reason saved on the live site is about the address, and stays a bounce', () => {
    for (const reason of [
      '5.5.0 Requested action not taken: mailbox unavailable (S2017062302).',
      '5.1.1 The email account that you tried to reach does not exist. Please try\n5.1.1 double-checking',
      '5.1.1 x@iprimus.com.au recipient rejected',
      '5.4.1 Recipient address rejected: Access denied. For more information see https://aka.ms/EXOSmtpErrors',
      '30 Sorry, your message to x@aol.com cannot be delivered. This mailbox is disabled (554.30).',
      'unable to connect to MX servers:\n - auxilis.com: connection failed: while dialing: dial tcp4 204.220.184.31:0->52.40.42.113:25: i/o timeout',
      '5.2.2 The recipient\'s inbox is out of storage space and inactive.',
      'Too old',
      'Not delivering to previously bounced address',
      'Rejected on send',
      'Fake or misspelt address (cleanup)',
      '1 Requested mail action aborted, mailbox not found',
      '5.1.1 <x@y.com>: Recipient address rejected: User unknown in virtual mailbox table',
    ]) expect(blamesOurSending(reason), reason).toBe(false);
  });
});

describe('the list of members who missed out (record-missed-recipients)', () => {
  it('reads "sendId,memberId" lines, with or without a header, once each', async () => {
    const { parseMissedList } = await import('@/lib/campaigns/missedList');
    const { bySend, bad } = parseMissedList('sendId,memberId\r\ncmwy64z1b0009cw0jzkwljgit,cmaaaaaaaaaa1\ncmwy64z1b0009cw0jzkwljgit, cmaaaaaaaaaa1\ncmwzks887000ccw0jp5q3fxwc,cmbbbbbbbbbb2\n\n');
    expect(bad).toBe(0);
    expect(Object.fromEntries(bySend)).toEqual({ cmwy64z1b0009cw0jzkwljgit: ['cmaaaaaaaaaa1'], cmwzks887000ccw0jp5q3fxwc: ['cmbbbbbbbbbb2'] });
  });

  it('leaves out anything that isn\'t two ids', async () => {
    const { parseMissedList } = await import('@/lib/campaigns/missedList');
    const { bySend, bad } = parseMissedList("x,y\ncmwy64z1b0009cw0jzkwljgit,someone@example.com\ncmwy64z1b0009cw0jzkwljgit,cm1'; DROP TABLE x\n");
    expect(bySend.size).toBe(0);
    expect(bad).toBe(3);
  });
});
