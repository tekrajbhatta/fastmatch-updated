import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Items 14 and 15 only matter when sending actually fails, which the local
 * email and SMS stubs never do — so here the database and the senders are
 * stand-ins, and each test decides what fails.
 */

const db = vi.hoisted(() => ({
  members: new Map<string, any>(),
  memberUpdates: [] as any[],
  sendUpdates: [] as any[],
  matchUpdates: [] as any[],
  eventUpdates: [] as any[],
  send: null as any,
  matches: [] as any[],
  // Attendees: paid, checked-in bookings (sendMatchEmails emails every one).
  bookings: [] as any[],
  bookingUpdates: [] as any[],
}));

vi.mock('../prisma', () => ({
  prisma: {
    member: {
      findUnique: vi.fn(async ({ where }: any) => db.members.get(where.id) ?? null),
      findMany: vi.fn(async ({ where }: any) => (where.id.in as string[]).map((id) => db.members.get(id)).filter(Boolean)),
      update: vi.fn(async (args: any) => { db.memberUpdates.push(args); return {}; }),
    },
    campaignSend: {
      findUniqueOrThrow: vi.fn(async () => db.send),
      update: vi.fn(async (args: any) => { db.sendUpdates.push(args); return {}; }),
    },
    event: {
      findUniqueOrThrow: vi.fn(async () => ({ id: 'e1', name: '28-40 years', startsAt: new Date('2026-10-09T08:00:00Z'), city: { name: 'Sydney' } })),
      update: vi.fn(async (args: any) => { db.eventUpdates.push(args); return {}; }),
    },
    match: {
      findMany: vi.fn(async () => db.matches),
      updateMany: vi.fn(async (args: any) => { db.matchUpdates.push(args); return {}; }),
    },
    booking: {
      findMany: vi.fn(async () => db.bookings),
      update: vi.fn(async (args: any) => {
        db.bookingUpdates.push(args);
        const b = db.bookings.find((x) => x.id === args.where.id);
        if (b) Object.assign(b, args.data);
        return {};
      }),
    },
  },
}));

const sendEmail = vi.hoisted(() => vi.fn());
const sendSmsBulk = vi.hoisted(() => vi.fn());
vi.mock('../emails/send', () => ({ sendEmail }));
vi.mock('../sms/send', () => ({ sendSmsBulk, withOptOut: (b: string) => b }));

const member = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: `Member ${id}`, email: `${id}@example.test`, mobile: `04000000${id.slice(-2)}`, contactMethod: 'EMAIL_AND_SMS', emailBounced: false, ...over,
});

beforeEach(() => {
  db.members.clear();
  db.memberUpdates.length = 0;
  db.sendUpdates.length = 0;
  db.matchUpdates.length = 0;
  db.eventUpdates.length = 0;
  db.matches = [];
  db.bookings = [];
  db.bookingUpdates.length = 0;
  sendEmail.mockReset();
  sendSmsBulk.mockReset();
  process.env.JWT_SECRET = 'test-secret';
});

describe('blast batch (item 14)', () => {
  it('marks bounced only on a permanent rejection, still texts a bounced member, and counts failures', async () => {
    for (const m of [
      member('m01'), // email rejected: no such mailbox -> bounced
      member('m02'), // mail server down -> not bounced
      member('m03', { emailBounced: true }), // known bounced: no email, still a text
      member('m04'), // text rejected
      member('m05'), // all fine
    ]) db.members.set(m.id, m);
    db.send = {
      id: 's1', status: 'SENDING', sentCount: 0, failedCount: 0, recipientIds: ['m01', 'm02', 'm03', 'm04', 'm05'],
      campaign: { sendEmail: true, sendSms: true, ignorePreference: false, subject: 'Hi', smsBody: 'Hi', emailBody: null, heading: 'Hi', freeText: 'x' },
    };
    sendEmail.mockImplementation(async ({ to }: { to: string }) => {
      if (to === 'm01@example.test') throw Object.assign(new Error('Email send failed: 550'), { code: 'EENVELOPE', responseCode: 550, command: 'RCPT TO' });
      if (to === 'm02@example.test') throw Object.assign(new Error('Email send failed: connect'), { code: 'ECONNECTION' });
    });
    sendSmsBulk.mockImplementation(async ({ to }: { to: string[] }) => ({ sent: to.length - 1, failed: [{ to: '0400000004', reason: 'invalid' }] }));

    const { processCampaignSendBatch } = await import('../campaigns/runSend');
    const result = await processCampaignSendBatch('s1');

    // Only m01's address is marked bounced.
    expect(db.memberUpdates.map((u) => u.where.id)).toEqual(['m01']);
    // m03 isn't emailed, but is texted.
    expect(sendEmail.mock.calls.map((c) => c[0].to)).not.toContain('m03@example.test');
    expect(sendSmsBulk.mock.calls[0][0].to).toContain('0400000003');
    // m01, m02 (emails) and m04 (text) failed; m03 and m05 are fine.
    expect(result).toMatchObject({ done: true, sentCount: 5, failedCount: 3, status: 'SENT' });
    expect(db.sendUpdates[0].data).toMatchObject({ sentCount: 5, failedCount: 3, status: 'SENT' });
  });
});

describe('result emails (item 15)', () => {
  it('one failed email doesn’t stop the rest, and only matches where both people were emailed are marked', async () => {
    for (const m of [member('a1'), member('b2'), member('c3')]) db.members.set(m.id, m);
    db.matches = [
      { id: 'x1', memberAId: 'a1', memberBId: 'b2', result: 'DATE' },
      { id: 'x2', memberAId: 'a1', memberBId: 'c3', result: 'FRIEND' },
    ];
    sendEmail.mockImplementation(async ({ to }: { to: string }) => {
      if (to === 'b2@example.test') throw new Error('Email send failed');
    });

    const { sendMatchEmails } = await import('../sendMatchEmails');
    const outcome = await sendMatchEmails('e1');

    expect(sendEmail.mock.calls.map((c) => c[0].to).sort()).toEqual(['a1@example.test', 'b2@example.test', 'c3@example.test']);
    expect(outcome.sent).toBe(2);
    expect(outcome.failed).toEqual([{ memberId: 'b2', name: 'Member b2', email: 'b2@example.test' }]);
    expect(db.matchUpdates[0].where.id.in).toEqual(['x2']); // a1 + c3 both emailed; b2 wasn't
    expect(db.eventUpdates[0].data).toEqual({ matchEmailsSent: false });
  });

  it('everyone checked in gets one: with no match, Gil\'s "no mutual matches" email — and never twice', async () => {
    for (const m of [member('a1'), member('b2'), member('c3')]) db.members.set(m.id, m);
    db.matches = [{ id: 'x1', memberAId: 'a1', memberBId: 'b2', result: 'DATE', emailSent: false }];
    db.bookings = [
      { id: 'k1', memberId: 'a1', resultsEmailedAt: null },
      { id: 'k2', memberId: 'b2', resultsEmailedAt: null },
      { id: 'k3', memberId: 'c3', resultsEmailedAt: null }, // checked in, no match
    ];
    sendEmail.mockImplementation(async () => {});

    const { sendMatchEmails } = await import('../sendMatchEmails');
    const first = await sendMatchEmails('e1');
    const sent = sendEmail.mock.calls.map((c) => [c[0].to, c[0].subject]).sort();
    expect(first.sent).toBe(3);
    expect(sent).toEqual([
      ['a1@example.test', 'Your matches from 28-40 years'],
      ['b2@example.test', 'Your matches from 28-40 years'],
      ['c3@example.test', 'Your results from 28-40 years'],
    ]);
    expect(sendEmail.mock.calls.find((c) => c[0].to === 'c3@example.test')?.[0].html).toContain('Sorry you did not have any mutual matches');
    expect(db.bookings.every((b) => b.resultsEmailedAt instanceof Date)).toBe(true);
    expect(db.matchUpdates[0].where.id.in).toEqual(['x1']);

    // Run again (a retry, say): nobody is emailed a second time.
    db.matches = [{ ...db.matches[0], emailSent: true }];
    sendEmail.mockClear();
    const second = await sendMatchEmails('e1');
    expect(second.sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
