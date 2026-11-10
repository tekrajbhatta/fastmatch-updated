import { describe, it, expect, vi, beforeEach } from 'vitest';
import { friendShareRefundEmail } from '@/lib/emails/eventEmails';

/**
 * Batch 11 (review item 6): a group payment that included a friend who was
 * already booked used to keep that friend's share, with only a line in the
 * server log. Now it goes back to the member's card, Gil is emailed and the
 * member is told.
 *
 * D2 (friend privacy): the same now happens for every reason a friend who
 * already has an account can't come (checked only once it's paid), and the
 * member is told in one wording whatever the reason ("couldn't be added"):
 * the old "was already booked into this event" said what the friend's own
 * booking was. Gil's notice names the reason. The database, Stripe and email
 * are stood in for.
 */
const h = vi.hoisted(() => ({
  refund: { outcome: 'refunded', amount: 39 } as any,
  refundCalls: [] as any[],
  emails: [] as { to: string; subject: string; html: string }[],
  alerts: [] as any[],
  notices: [] as any[],
}));
vi.mock('../prisma', () => ({
  prisma: {
    booking: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: 'b1', member: { name: 'Lisa <L>', email: 'lisa@example.test' },
        event: { name: '28-40 years', startsAt: new Date('2026-11-14T08:30:00Z'), theme: { name: 'Speed dating' }, city: { name: 'Sydney' } },
      })),
    },
  },
}));
vi.mock('../refunds', () => ({ refundPartOfCheckout: vi.fn(async (...args: any[]) => { h.refundCalls.push(args); return h.refund; }) }));
vi.mock('../emails/send', () => ({ sendEmail: vi.fn(async (m: any) => { h.emails.push(m); }) }));
vi.mock('../paymentAlerts', () => ({
  alertRefundNeeded: vi.fn(async (a: any) => { h.alerts.push(a); }),
  notifyAutoRefund: vi.fn(async (a: any) => { h.notices.push(a); }),
}));

beforeEach(() => {
  h.refund = { outcome: 'refunded', amount: 39 };
  h.refundCalls = []; h.emails = []; h.alerts = []; h.notices = [];
});

describe('refundFriendsNotAdded', () => {
  it('refunds the friend\'s share to the card, once per friend, tells the member and emails Gil (with the reason)', async () => {
    const { refundFriendsNotAdded } = await import('../friendShareRefund');
    await refundFriendsNotAdded('b1', 'cs_1', [{ name: 'Tom', email: 'Tom@Example.test', amount: 39, reason: 'they were already booked into this event' }]);
    expect(h.refundCalls).toEqual([['cs_1', 39, { bookingId: 'b1', reason: 'friend_not_added', key: 'fastmatch-refund-cs_1-friend-tom@example.test' }]]);
    expect(h.notices).toEqual([expect.objectContaining({
      why: 'friendNotAdded', sessionId: 'cs_1', amount: 39, friend: { name: 'Tom', email: 'Tom@Example.test', reason: 'they were already booked into this event' },
    })]);
    expect(h.emails).toHaveLength(1);
    expect(h.emails[0]).toMatchObject({ to: 'lisa@example.test', subject: "Tom couldn't be added to your booking" });
    expect(h.emails[0].html).toContain('Hi Lisa &lt;L&gt;,');
    expect(h.emails[0].html).toContain("so their share (<strong>$39</strong>) has been refunded to your card");
    // Never why.
    expect(h.emails[0].html).not.toMatch(/already booked|registered|date of birth|gender|age/i);
    expect(h.alerts).toEqual([]);
  });

  it('the old name (src/lib/adminBooking.ts) does the same', async () => {
    const { refundFriendsAlreadyBooked } = await import('../friendShareRefund');
    await refundFriendsAlreadyBooked('b1', 'cs_1', [{ name: 'Tom', email: 'tom@example.test', amount: 39 }]);
    expect(h.refundCalls).toHaveLength(1);
    expect(h.emails[0].subject).toBe("Tom couldn't be added to your booking");
  });

  it('a share Stripe won\'t refund: Gil is asked to (the reason in his email only), and the member told it will be', async () => {
    h.refund = { outcome: 'failed', reason: 'Stripe is down' };
    const { refundFriendsNotAdded } = await import('../friendShareRefund');
    await refundFriendsNotAdded('b1', 'cs_1', [{ name: 'Tom', email: 'tom@example.test', amount: 39, reason: "they're registered as female, but were booked as male" }]);
    expect(h.alerts).toEqual([expect.objectContaining({
      sessionId: 'cs_1', bookingId: 'b1', amount: 39, detail: "Why they couldn't be added: they're registered as female, but were booked as male",
    })]);
    expect(h.alerts[0].reason).not.toMatch(/female/);
    expect(h.notices).toEqual([]);
    expect(h.emails[0].html).toContain('so their share (<strong>$39</strong>) will be refunded to your card');
  });

  // It used to send nothing: the member wasn't told their friend wasn't booked.
  it('a place that cost nothing: nothing refunded, Gil not emailed, the member still told', async () => {
    const { refundFriendsNotAdded } = await import('../friendShareRefund');
    await refundFriendsNotAdded('b1', 'cs_1', [{ name: 'Tom', email: 'tom@example.test', amount: 0 }]);
    await refundFriendsNotAdded('b1', null, [{ name: 'Ann', email: 'ann@example.test', amount: 0 }]);
    expect(h.refundCalls).toEqual([]);
    expect(h.notices).toEqual([]);
    expect(h.emails.map((e) => e.subject)).toEqual(["Tom couldn't be added to your booking", "Ann couldn't be added to your booking"]);
    expect(h.emails[1].html).not.toMatch(/refund|\$/);
    expect(h.emails[1].html).toContain("If they'd still like to come, they can book themselves.");
  });
});

describe('the email', () => {
  it('names the friend (as typed), the event and the amount, never why', () => {
    const { html } = friendShareRefundEmail({
      memberName: 'Lisa', friendName: 'Tom', eventName: 'Speed dating, 28-40 years', startsAt: new Date('2026-11-14T08:30:00Z'),
      timeZone: 'Australia/Sydney', refunded: 39, amount: 39,
    });
    expect(html).toContain("Tom couldn't be added to your booking for <strong>Speed dating, 28-40 years</strong> on Saturday 14 November, so their share (<strong>$39</strong>) has been refunded to your card.");
    expect(html).toContain("If they'd still like to come, they can book themselves.");
    expect(html).toContain('Your own booking is confirmed');
  });
});
