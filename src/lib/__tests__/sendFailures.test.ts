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
      findUniqueOrThrow: vi.fn(async () => ({ ...db.send })),
      // The claim: only while the send is still in the state asked for.
      updateMany: vi.fn(async ({ where, data }: any) => {
        const s = db.send;
        const sc = where.sentCount;
        const atCount = typeof sc === 'number' ? s.sentCount === sc : sc?.gte != null ? s.sentCount >= sc.gte : true;
        if (s.id !== where.id || s.status !== where.status || !atCount) return { count: 0 };
        Object.assign(s, data);
        return { count: 1 };
      }),
      update: vi.fn(async (args: any) => {
        db.sendUpdates.push(args);
        const inc = args.data.failedCount?.increment;
        if (inc != null) db.send.failedCount += inc;
        return {};
      }),
    },
    event: {
      findUniqueOrThrow: vi.fn(async () => ({ id: 'e1', name: '28-40 years', startsAt: new Date('2026-10-09T08:00:00Z'), city: { name: 'Sydney' }, theme: { name: 'Speed dating' } })),
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
  id, name: `Member ${id}`, email: `${id}@example.test`, mobile: `04000000${id.slice(-2)}`, contactMethod: 'EMAIL_AND_SMS', emailBounced: false,
  marketingOptIn: true, emailVerified: true, mobileVerified: true, ...over,
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
    expect(db.sendUpdates[0].data).toEqual({ failedCount: { increment: 3 } });
  });
});

/**
 * Batch 11 (review items 1, 4, 11): each recipient is claimed before anything
 * goes to them, so two runs at once (the scheduled job while "Send Blast Now"
 * is still on its first batch) never send to the same person; and the send
 * re-checks each person as it reaches them.
 */
describe('blast batch: claimed one recipient at a time', () => {
  const blast = (ids: string[], over: Record<string, unknown> = {}) => ({
    id: 's1', status: 'SENDING', sentCount: 0, failedCount: 0, recipientIds: ids,
    campaign: { sendEmail: true, sendSms: true, ignorePreference: false, subject: 'Hi', smsBody: 'Hi', emailBody: null, heading: 'Hi', freeText: 'x', ...over },
  });

  it('two runs at once send to each person once', async () => {
    const ids = ['m01', 'm02', 'm03', 'm04', 'm05', 'm06'];
    for (const id of ids) db.members.set(id, member(id));
    db.send = blast(ids);
    sendEmail.mockImplementation(async () => { await new Promise((r) => setTimeout(r, 5)); });
    sendSmsBulk.mockImplementation(async ({ to }: { to: string[] }) => ({ sent: to.length, failed: [] }));

    const { processCampaignSendBatch } = await import('../campaigns/runSend');
    await Promise.all([processCampaignSendBatch('s1'), processCampaignSendBatch('s1')]);

    expect(sendEmail.mock.calls.map((c) => c[0].to).sort()).toEqual(ids.map((id) => `${id}@example.test`));
    expect(sendSmsBulk.mock.calls.flatMap((c) => c[0].to).sort()).toEqual(ids.map((id) => `04000000${id.slice(-2)}`).sort());
    expect(db.send).toMatchObject({ sentCount: 6, status: 'SENT' });
  });

  it('leaves out anyone who unsubscribed since it started, and addresses or mobiles not confirmed', async () => {
    db.members.set('m01', member('m01', { marketingOptIn: false }));
    db.members.set('m02', member('m02', { emailVerified: false }));
    db.members.set('m03', member('m03', { mobileVerified: false }));
    db.send = blast(['m01', 'm02', 'm03']);
    sendEmail.mockImplementation(async () => {});
    sendSmsBulk.mockImplementation(async ({ to }: { to: string[] }) => ({ sent: to.length, failed: [] }));

    const { processCampaignSendBatch } = await import('../campaigns/runSend');
    await processCampaignSendBatch('s1');

    expect(sendEmail.mock.calls.map((c) => c[0].to)).toEqual(['m03@example.test']);
    expect(sendSmsBulk.mock.calls[0][0].to).toEqual(['0400000002']);
    expect(db.send).toMatchObject({ sentCount: 3, failedCount: 0, status: 'SENT' });
  });

  it('two members sharing a mobile: the number is texted once, still both emailed (batch 13)', async () => {
    db.members.set('m01', member('m01', { mobile: '0412 345 678' }));
    db.members.set('m02', member('m02', { mobile: '+61412345678' }));
    db.members.set('m03', member('m03'));
    db.send = blast(['m01', 'm02', 'm03']);
    sendEmail.mockImplementation(async () => {});
    sendSmsBulk.mockImplementation(async ({ to }: { to: string[] }) => ({ sent: to.length, failed: [] }));

    const { processCampaignSendBatch } = await import('../campaigns/runSend');
    await processCampaignSendBatch('s1');

    expect(sendEmail.mock.calls.map((c) => c[0].to)).toEqual(['m01@example.test', 'm02@example.test', 'm03@example.test']);
    expect(sendSmsBulk.mock.calls[0][0].to).toEqual(['0412 345 678', '0400000003']);
  });

  it('a pause takes effect straight away, and resuming finishes it', async () => {
    const ids = ['m01', 'm02', 'm03'];
    for (const id of ids) db.members.set(id, member(id));
    db.send = blast(ids, { sendSms: false });
    sendEmail.mockImplementation(async ({ to }: { to: string }) => { if (to === 'm01@example.test') db.send.status = 'PAUSED'; });

    const { processCampaignSendBatch } = await import('../campaigns/runSend');
    const paused = await processCampaignSendBatch('s1');
    expect(paused).toMatchObject({ sentCount: 1, status: 'PAUSED', done: false });
    expect(sendEmail).toHaveBeenCalledTimes(1);

    db.send.status = 'SENDING';
    await processCampaignSendBatch('s1');
    expect(sendEmail.mock.calls.map((c) => c[0].to)).toEqual(['m01@example.test', 'm02@example.test', 'm03@example.test']);
    expect(db.send.status).toBe('SENT');
  });
});

describe('result emails (item 15)', () => {
  it('one failed email doesn’t stop the rest, and only matches where both people were emailed are marked', async () => {
    for (const m of [member('a1'), member('b2'), member('c3')]) db.members.set(m.id, m);
    db.matches = [
      { id: 'x1', memberAId: 'a1', memberBId: 'b2', result: 'DATE' },
      { id: 'x2', memberAId: 'a1', memberBId: 'c3', result: 'FRIEND' },
    ];
    db.bookings = [
      { id: 'k1', memberId: 'a1', resultsEmailedAt: null },
      { id: 'k2', memberId: 'b2', resultsEmailedAt: null },
      { id: 'k3', memberId: 'c3', resultsEmailedAt: null },
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
    // Named by the event's type and name (Gil, item 14).
    expect(sent).toEqual([
      ['a1@example.test', 'Your matches from Speed dating, 28-40 years'],
      ['b2@example.test', 'Your matches from Speed dating, 28-40 years'],
      ['c3@example.test', 'Your results from Speed dating, 28-40 years'],
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

  it('someone removed from the night after the results were worked out gets nothing, and is in nobody\'s email (batch 11)', async () => {
    for (const m of [member('a1'), member('b2')]) db.members.set(m.id, m);
    db.matches = [{ id: 'x1', memberAId: 'a1', memberBId: 'b2', result: 'DATE', emailSent: false }];
    // b2's booking was cancelled (or unticked): only a1 is still on the night.
    db.bookings = [{ id: 'k1', memberId: 'a1', resultsEmailedAt: null }];
    sendEmail.mockImplementation(async () => {});

    const { sendMatchEmails } = await import('../sendMatchEmails');
    await sendMatchEmails('e1');
    expect(sendEmail.mock.calls.map((c) => c[0].to)).toEqual(['a1@example.test']);
    const html = sendEmail.mock.calls[0][0].html as string;
    expect(html).not.toContain('b2@example.test');
    expect(html).toContain('Sorry you did not have any mutual matches');
  });
});
