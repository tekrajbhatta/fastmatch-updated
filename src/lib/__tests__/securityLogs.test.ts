import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { inspect } from 'util';

/**
 * Batch S4a: personal details out of the server and cron logs, and safety
 * nets in the two senders.
 *   - sendEmail takes exactly one address, fails on the live site when the
 *     mail login is missing (instead of logging every recipient), and logs a
 *     failed send with the address masked and without the whole error.
 *   - sendSmsBulk / sendSms only ever text Australian mobiles, fail on the
 *     live site when the Cellcast key is missing (instead of logging codes),
 *     and mask numbers in what they log.
 *   - The refund alert logs ids, not the member's name.
 */

const sendMail = vi.hoisted(() => vi.fn());
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }));

import { sendEmail, providerMessage } from '@/lib/emails/send';
import { sendSms, sendSmsBulk, NOT_AU_MOBILE, redactNumbers } from '@/lib/sms/send';
import { alertRefundNeeded } from '@/lib/paymentAlerts';

/** Everything written to console.error / console.log, as it would be printed. */
function captureConsole() {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  return () => [...error.mock.calls, ...log.mock.calls, ...warn.mock.calls].map((args) => args.map((a) => (typeof a === 'string' ? a : inspect(a, { depth: 5 }))).join(' ')).join('\n');
}

beforeEach(() => {
  sendMail.mockReset();
  vi.stubEnv('MAILGUN_SMTP_USER', '');
  vi.stubEnv('MAILGUN_SMTP_PASS', '');
  vi.stubEnv('CELLCAST_API_KEY', '');
  vi.stubEnv('NODE_ENV', 'test');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sendEmail: one address only', () => {
  it('refuses a list, a display name, a header trick or nothing at all, and sends nothing', async () => {
    vi.stubEnv('MAILGUN_SMTP_USER', 'u');
    vi.stubEnv('MAILGUN_SMTP_PASS', 'p');
    captureConsole();
    for (const to of ['a@example.com, b@example.com', 'a@example.com;b@example.com', 'Ann <a@example.com>', 'a@example.com\r\nBcc: b@example.com', 'not-an-address', '']) {
      await expect(sendEmail({ to, subject: 's', html: 'h' }), JSON.stringify(to)).rejects.toThrow(/isn't a single email address/);
    }
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('still sends to an ordinary address, with spaces around it trimmed', async () => {
    vi.stubEnv('MAILGUN_SMTP_USER', 'u');
    vi.stubEnv('MAILGUN_SMTP_PASS', 'p');
    sendMail.mockResolvedValue({});
    await sendEmail({ to: "  anna.o'brien+fm@example.com ", subject: 's', html: 'h' });
    expect(sendMail.mock.calls[0][0].to).toBe("anna.o'brien+fm@example.com");
  });
});

describe('sendEmail: no mail login', () => {
  it('fails on the live site rather than logging who would have been emailed', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const printed = captureConsole();
    await expect(sendEmail({ to: 'jane.smith@example.com', subject: 'Reset your password', html: 'h' })).rejects.toThrow(/MAILGUN_SMTP_USER/);
    expect(printed()).not.toContain('jane.smith');
  });

  it('keeps the local-development stub (NODE_ENV not production)', async () => {
    const printed = captureConsole();
    await sendEmail({ to: 'jane.smith@example.com', subject: 'Hi', html: 'h' });
    expect(printed()).toContain('[stub] Would email jane.smith@example.com: "Hi"');
  });
});

describe('sendEmail: a refused send', () => {
  it('logs and throws the mail server\'s answer with the address masked, keeping the codes a blast needs', async () => {
    vi.stubEnv('MAILGUN_SMTP_USER', 'u');
    vi.stubEnv('MAILGUN_SMTP_PASS', 'p');
    sendMail.mockRejectedValue(Object.assign(
      new Error("Can't send mail - all recipients were rejected: 550 5.1.1 <jane.smith@gmail.com>: Recipient address rejected"),
      { responseCode: 550, code: 'EENVELOPE', command: 'RCPT TO', rejected: ['jane.smith@gmail.com'], envelope: { to: ['jane.smith@gmail.com'] } },
    ));
    const printed = captureConsole();
    const err = await sendEmail({ to: 'jane.smith@gmail.com', subject: 's', html: 'h' }).catch((e) => e);

    expect(err).toMatchObject({ responseCode: 550, code: 'EENVELOPE', command: 'RCPT TO' });
    expect(err.message).toContain('550 5.1.1 <j***@g***.com>');
    // What a caller would print when it logs the error it caught.
    expect(inspect(err, { depth: 5 })).not.toContain('jane.smith');
    expect(printed()).toContain('Failed to send email to j***@g***.com: EENVELOPE 550 (RCPT TO)');
    expect(printed()).not.toContain('jane.smith');
    // The admin's test send still shows the answer as it came.
    expect(providerMessage(err)).toContain('<jane.smith@gmail.com>');
  });
});

describe('sendSmsBulk / sendSms: Australian mobiles only', () => {
  const OK = JSON.stringify({ status: true, data: { queueResponse: [{ Contact: '412345678' }] } });

  it('texts the Australian mobiles and reports the rest as failed, without sending to them', async () => {
    vi.stubEnv('CELLCAST_API_KEY', 'k');
    const fetchSpy = vi.fn(async () => new Response(OK, { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    captureConsole();
    const r = await sendSmsBulk({ to: ['0412 345 678', '02 9211 0222', '+44 7700 900123', '1900 123 456'], body: 'hi' });
    expect(JSON.parse((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).contacts).toEqual(['61412345678']);
    expect(r.sent).toBe(1);
    expect(r.failed).toEqual([
      { to: '02 9211 0222', reason: NOT_AU_MOBILE },
      { to: '+44 7700 900123', reason: NOT_AU_MOBILE },
      { to: '1900 123 456', reason: NOT_AU_MOBILE },
    ]);
  });

  it('makes no request at all when no number is an Australian mobile', async () => {
    vi.stubEnv('CELLCAST_API_KEY', 'k');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect((await sendSmsBulk({ to: ['0292110222'], body: 'hi' })).failed).toHaveLength(1);
    await expect(sendSms({ to: '+447700900123', body: 'hi' })).rejects.toThrow(/not an australian mobile/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('SMS: no Cellcast key', () => {
  it('fails on the live site rather than printing the number and the code', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const printed = captureConsole();
    await expect(sendSms({ to: '0412345678', body: 'Your FastMatch code is 123456' })).rejects.toThrow(/CELLCAST_API_KEY/);
    await expect(sendSmsBulk({ to: ['0412345678'], body: 'Your FastMatch code is 123456' })).rejects.toThrow(/CELLCAST_API_KEY/);
    expect(printed()).not.toContain('123456');
    expect(printed()).not.toContain('0412345678');
  });

  it('keeps the local-development stub', async () => {
    const printed = captureConsole();
    await sendSms({ to: '0412345678', body: 'code 123456' });
    expect(printed()).toContain('[stub] Would SMS 0412345678');
  });
});

describe('SMS: what Cellcast says back is logged without the numbers', () => {
  it('masks rejected numbers', async () => {
    vi.stubEnv('CELLCAST_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      status: true,
      data: { queueResponse: [], invalidContacts: [{ Contact: '412345678', Error: 'Number is not valid' }], unsubscribeContacts: ['498765432'] },
    }), { status: 200 })));
    const printed = captureConsole();
    const r = await sendSmsBulk({ to: ['0412345678', '0498765432'], body: 'hi' });
    // The caller still gets the real numbers, to match them to members.
    expect(r.failed.map((f) => f.to).sort()).toEqual(['0412345678', '0498765432']);
    expect(printed()).toContain('***678');
    expect(printed()).not.toMatch(/412345678|498765432/);
  });

  it('masks numbers quoted in a refused request', async () => {
    vi.stubEnv('CELLCAST_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 400, message: 'Invalid contacts: 61412345678, +61 498 765 432' }), { status: 400 })));
    const printed = captureConsole();
    await sendSmsBulk({ to: ['0412345678'], body: 'hi' });
    expect(printed()).not.toMatch(/412345678|498 765 432/);
    expect(redactNumbers('HTTP 400 for 61412345678')).toBe('HTTP 400 for ***678');
  });
});

describe('alertRefundNeeded', () => {
  it('logs the checkout and booking, not the member, and masks an address in the reason', async () => {
    const printed = captureConsole();
    await alertRefundNeeded({
      sessionId: 'cs_test_1', bookingId: 'bk_1', memberName: 'Jane Smith', eventName: 'Speed dating, 30-45', amount: 49,
      reason: 'Tom Reid (tom.reid@example.com) was already booked',
    });
    const errors = printed().split('\n').filter((l) => l.startsWith('REFUND NEEDED'));
    expect(errors[0]).toContain('cs_test_1');
    expect(errors[0]).toContain('bk_1');
    expect(errors[0]).not.toContain('Jane Smith');
    expect(errors[0]).not.toContain('tom.reid@example.com');
    expect(errors[0]).toContain('t***@e***.com');
  });
});
