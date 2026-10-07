import { describe, it, expect, vi, beforeEach } from 'vitest';
import { friendShareRefundEmail } from '@/lib/emails/eventEmails';

/**
 * Batch 11 (review item 6): a group payment that included a friend who was
 * already booked (they booked themselves while the member was paying) used to
 * keep that friend's share, with only a line in the server log. Now it goes
 * back to the member's card, Gil is emailed and the member is told. The
 * database, Stripe and email are stood in for.
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

describe('refundFriendsAlreadyBooked', () => {
  it('refunds the friend\'s share to the card, once per friend, tells the member and emails Gil', async () => {
    const { refundFriendsAlreadyBooked } = await import('../friendShareRefund');
    await refundFriendsAlreadyBooked('b1', 'cs_1', [{ name: 'Tom', email: 'Tom@Example.test', amount: 39 }]);
    expect(h.refundCalls).toEqual([['cs_1', 39, { bookingId: 'b1', reason: 'friend_already_booked', key: 'fastmatch-refund-cs_1-friend-tom@example.test' }]]);
    expect(h.notices).toEqual([expect.objectContaining({ why: 'friendBooked', sessionId: 'cs_1', amount: 39, friend: { name: 'Tom', email: 'Tom@Example.test' } })]);
    expect(h.emails).toHaveLength(1);
    expect(h.emails[0]).toMatchObject({ to: 'lisa@example.test', subject: "A refund for Tom's place" });
    expect(h.emails[0].html).toContain('Hi Lisa &lt;L&gt;,');
    expect(h.emails[0].html).toContain("we've refunded <strong>$39</strong> for their place to your card");
    expect(h.alerts).toEqual([]);
  });

  it('a share Stripe won\'t refund: Gil is asked to, and the member told it will be', async () => {
    h.refund = { outcome: 'failed', reason: 'Stripe is down' };
    const { refundFriendsAlreadyBooked } = await import('../friendShareRefund');
    await refundFriendsAlreadyBooked('b1', 'cs_1', [{ name: 'Tom', email: 'tom@example.test', amount: 39 }]);
    expect(h.alerts).toEqual([expect.objectContaining({ sessionId: 'cs_1', bookingId: 'b1', amount: 39 })]);
    expect(h.notices).toEqual([]);
    expect(h.emails[0].html).toContain('will be refunded to your card');
  });

  it('nothing to refund for a free place', async () => {
    const { refundFriendsAlreadyBooked } = await import('../friendShareRefund');
    await refundFriendsAlreadyBooked('b1', 'cs_1', [{ name: 'Tom', email: 'tom@example.test', amount: 0 }]);
    expect(h.refundCalls).toEqual([]);
    expect(h.emails).toEqual([]);
  });
});

describe('the email', () => {
  it('names the friend, the event and the amount', () => {
    const { html } = friendShareRefundEmail({
      memberName: 'Lisa', friendName: 'Tom', eventName: 'Speed dating, 28-40 years', startsAt: new Date('2026-11-14T08:30:00Z'),
      timeZone: 'Australia/Sydney', refunded: 39, amount: 39,
    });
    expect(html).toContain('Tom was already booked into <strong>Speed dating, 28-40 years</strong> on Saturday 14 November');
    expect(html).toContain('Your own booking is confirmed');
  });
});
