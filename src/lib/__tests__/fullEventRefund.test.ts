import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eventFullRefundEmail } from '@/lib/emails/eventEmails';

/**
 * Gil round 2, batch 7 (G2, Q1): a payment that comes through after its
 * 10-minute hold ran out, once the event is full, is refunded rather than
 * booked, and the member is told. The database, Stripe and email are stood in for.
 */
const h = vi.hoisted(() => ({
  booking: null as any,
  refund: { outcome: 'refunded', amount: 49 } as any,
  refundCalls: [] as any[],
  emails: [] as { to: string; subject: string; html: string }[],
  alerts: [] as any[],
  notices: [] as any[],
}));
vi.mock('../prisma', () => ({
  prisma: {
    booking: {
      findUnique: vi.fn(async () => h.booking && { ...h.booking }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const b = h.booking;
        if (!b || b.id !== where.id || b.status !== where.status || b.stripePaymentIntentId !== where.stripePaymentIntentId) return { count: 0 };
        Object.assign(b, data);
        return { count: 1 };
      }),
    },
  },
}));
vi.mock('../refunds', () => ({ refundCheckoutSession: vi.fn(async (...args: any[]) => { h.refundCalls.push(args); return h.refund; }) }));
vi.mock('../emails/send', () => ({ sendEmail: vi.fn(async (m: any) => { h.emails.push(m); }) }));
vi.mock('../paymentAlerts', () => ({
  alertRefundNeeded: vi.fn(async (a: any) => { h.alerts.push(a); }),
  notifyAutoRefund: vi.fn(async (a: any) => { h.notices.push(a); }),
}));

beforeEach(() => {
  h.booking = {
    id: 'b1', status: 'PENDING', stripePaymentIntentId: 'cs_1', paidAmount: '49', pendingFriends: [{ name: 'Pal' }],
    member: { name: 'Ann <A>', email: 'ann@example.test' },
    event: { name: '28-40 years', startsAt: new Date('2026-11-14T08:30:00Z'), theme: { name: 'Speed dating' }, city: { name: 'Sydney' } },
  };
  h.refund = { outcome: 'refunded', amount: 49 };
  h.refundCalls = []; h.emails = []; h.alerts = []; h.notices = [];
});

describe('the "event filled up" email', () => {
  const base = { memberName: 'Ann', eventName: 'Speed dating, 28-40 years', startsAt: new Date('2026-11-14T08:30:00Z'), timeZone: 'Australia/Sydney', eventsUrl: 'https://x.test/events' };
  it('says what happened, what was refunded, and where to find other events', () => {
    const { subject, html } = eventFullRefundEmail({ ...base, refunded: 49, amount: 49 });
    expect(subject).toBe('Sorry, Speed dating, 28-40 years is full');
    expect(html).toContain('<strong>Speed dating, 28-40 years</strong> on Saturday 14 November filled up while you were paying');
    expect(html).toContain('Your payment of <strong>$49</strong> has been refunded to your card.');
    expect(html).toContain('href="https://x.test/events"');
  });
  it('when Stripe refused the refund, says it will be refunded', () => {
    expect(eventFullRefundEmail({ ...base, refunded: null, amount: 98 }).html).toContain('Your payment of <strong>$98</strong> will be refunded to your card in full.');
  });
});

describe('refundPaymentForFullEvent', () => {
  it('refunds it, records it as "Cancelled – refunded", and emails them, once', async () => {
    const { refundPaymentForFullEvent } = await import('../fullEventRefund');
    await refundPaymentForFullEvent('b1', 'cs_1', 49);
    expect(h.refundCalls).toEqual([['cs_1', { bookingId: 'b1', reason: 'event_full' }]]);
    expect(h.booking).toMatchObject({ status: 'REFUNDED', paidAmount: 49, checkedIn: false });
    expect(h.emails).toHaveLength(1);
    expect(h.emails[0]).toMatchObject({ to: 'ann@example.test', subject: 'Sorry, Speed dating, 28-40 years is full' });
    expect(h.emails[0].html).toContain('Hi Ann &lt;A&gt;,');
    // Gil hears about it too, for his records (the user, 6 Oct).
    expect(h.notices).toEqual([{ why: 'full', sessionId: 'cs_1', memberName: 'Ann <A>', memberEmail: 'ann@example.test', eventName: 'Speed dating, 28-40 years', amount: 49 }]);
    // Stripe sends the notice again: refunded already, nobody emailed again.
    h.refund = { outcome: 'already-refunded', amount: 49 };
    await refundPaymentForFullEvent('b1', 'cs_1', 49);
    expect(h.emails).toHaveLength(1);
    expect(h.alerts).toHaveLength(0);
    expect(h.notices).toHaveLength(1);
  });

  it('a refund Stripe won\'t make: cancelled, Gil emailed, and they\'re told it will be refunded', async () => {
    const { refundPaymentForFullEvent } = await import('../fullEventRefund');
    h.refund = { outcome: 'failed', reason: 'Stripe is down' };
    await refundPaymentForFullEvent('b1', 'cs_1', 98);
    expect(h.booking.status).toBe('CANCELLED');
    expect(h.alerts).toHaveLength(1);
    expect(h.alerts[0]).toMatchObject({ sessionId: 'cs_1', bookingId: 'b1', amount: 98 });
    expect(h.emails[0].html).toContain('will be refunded to your card in full');
    // He's emailed to refund it himself instead, not told it's done.
    expect(h.notices).toHaveLength(0);
  });

  it('nothing paid on that page: nothing to do', async () => {
    const { refundPaymentForFullEvent } = await import('../fullEventRefund');
    h.refund = { outcome: 'not-paid' };
    await refundPaymentForFullEvent('b1', 'cs_1', null);
    expect(h.booking.status).toBe('PENDING');
    expect(h.emails).toHaveLength(0);
  });
});
