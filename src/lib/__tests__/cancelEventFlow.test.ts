import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Gil round 2, batch 6 (G1): what "Cancel event" does to each booking. The
 * database, Stripe, email and SMS are stood in for.
 */
const h = vi.hoisted(() => ({
  event: null as any,
  bookings: [] as any[],
  updates: [] as any[],
  emails: [] as { to: string; subject: string; html: string }[],
  sms: [] as { to: string; body: string }[],
  alerts: [] as any[],
  notices: [] as any[],
  close: {} as Record<string, 'paid' | 'closed'>,
  dropped: [] as string[],
  refunds: {} as Record<string, any>,
  refundCalls: [] as string[],
}));

vi.mock('../prisma', () => ({
  prisma: {
    event: {
      findUniqueOrThrow: vi.fn(async () => h.event),
      update: vi.fn(async ({ data }: any) => { Object.assign(h.event, data); return h.event; }),
    },
    booking: {
      findMany: vi.fn(async ({ where }: any) => h.bookings.filter((b) => where.status.in.includes(b.status)).map((b) => ({ ...b }))),
      findUnique: vi.fn(async ({ where }: any) => {
        const b = h.bookings.find((x) => x.id === where.id);
        return b ? { ...b, event: h.event } : null;
      }),
      // The claim: only while it still has the status asked for.
      updateMany: vi.fn(async ({ where, data }: any) => {
        h.updates.push({ where, data });
        const b = h.bookings.find((x) => x.id === where.id && x.status === where.status && (!where.stripePaymentIntentId || x.stripePaymentIntentId === where.stripePaymentIntentId));
        if (!b) return { count: 0 };
        Object.assign(b, data);
        return { count: 1 };
      }),
      update: vi.fn(async ({ where, data }: any) => { const b = h.bookings.find((x) => x.id === where.id); Object.assign(b, data); return b; }),
    },
  },
}));
vi.mock('../pendingBooking', () => ({
  closeCheckout: vi.fn(async (b: any) => h.close[b.id] ?? 'closed'),
  dropUnpaidBooking: vi.fn(async (id: string) => { h.dropped.push(id); h.bookings = h.bookings.filter((b) => b.id !== id); }),
}));
vi.mock('../refunds', () => ({
  refundCheckoutSession: vi.fn(async (sessionId: string) => { h.refundCalls.push(sessionId); return h.refunds[sessionId] ?? { outcome: 'not-paid' }; }),
}));
vi.mock('../emails/send', () => ({ sendEmail: vi.fn(async (m: any) => { h.emails.push(m); }) }));
vi.mock('../sms/send', () => ({ sendSms: vi.fn(async (m: any) => { h.sms.push(m); }) }));
vi.mock('../paymentAlerts', () => ({
  alertRefundNeeded: vi.fn(async (a: any) => { h.alerts.push(a); }),
  notifyAutoRefund: vi.fn(async (a: any) => { h.notices.push(a); }),
}));

const sydney = { name: 'Sydney' };
const member = (n: string) => ({ name: n, email: `${n.toLowerCase()}@example.test`, mobile: `04000000${n.length}`, city: sydney });
const booking = (id: string, o: Record<string, unknown>) => ({
  id, badge: 1, status: 'CONFIRMED', paidAmount: '49', paymentMethod: null, stripePaymentIntentId: null, bookedById: null,
  checkedIn: true, member: member(id), ...o,
});

beforeEach(() => {
  h.event = {
    id: 'e1', name: '28-40 years', status: 'UPCOMING', startsAt: new Date('2026-11-14T08:30:00Z'), ageMin: 28, ageMax: 40,
    theme: { name: 'Speed dating' }, venue: { name: 'Soultrap', address: '1 Crown St' }, city: sydney,
  };
  h.bookings = [
    booking('Lead', { stripePaymentIntentId: 'cs_lead' }),                          // paid online for herself and a friend
    booking('Friend', { paidAmount: '39', bookedById: 'Lead' }),
    booking('Cash', { paymentMethod: 'CASH', paidAmount: '45' }),
    booking('Door', { paymentMethod: 'PAY_AT_DOOR', paidAmount: '0' }),
    booking('Failing', { stripePaymentIntentId: 'cs_fail' }),
    booking('Gone', { status: 'CANCELLED', stripePaymentIntentId: 'cs_gone' }),      // cancelled before: left alone
    booking('Paying', { status: 'PENDING', stripePaymentIntentId: 'cs_paying' }),    // paying right now
    booking('Abandoned', { status: 'PENDING', stripePaymentIntentId: 'cs_open' }),   // page still open, unpaid
  ];
  h.updates = []; h.emails = []; h.sms = []; h.alerts = []; h.notices = []; h.dropped = []; h.refundCalls = [];
  h.close = { Paying: 'paid', Abandoned: 'closed' };
  h.refunds = {
    cs_lead: { outcome: 'refunded', amount: 88 },
    cs_fail: { outcome: 'failed', reason: 'Stripe is down' },
  };
});

describe('cancelEvent (Gil, Q2-Q4)', () => {
  it('cancels every booking, refunds what was paid online, and tells everyone', async () => {
    const { cancelEvent } = await import('../cancelEvent');
    const o = await cancelEvent('e1');
    const status = (id: string) => h.bookings.find((b) => b.id === id)?.status;

    expect(h.event.status).toBe('CANCELLED');
    // Online card payment: refunded, "Cancelled – refunded".
    expect(o.refunded).toEqual([{ member: 'Lead', amount: 88 }]);
    expect(status('Lead')).toBe('REFUNDED');
    // A friend's place is part of the lead's payment: cancelled, not refunded separately.
    expect(status('Friend')).toBe('CANCELLED');
    expect(h.refundCalls).toEqual(['cs_lead', 'cs_fail']);
    // Cash: cancelled, for Gil to refund; pay at the door with nothing paid: just cancelled.
    expect(o.byHand).toEqual([{ member: 'Cash', amount: 45, method: 'Cash' }]);
    expect(status('Cash')).toBe('CANCELLED');
    expect(status('Door')).toBe('CANCELLED');
    // A refund that didn't go through: cancelled, reported, and Gil emailed.
    expect(o.refundFailed).toEqual([{ member: 'Failing', reason: 'Stripe is down' }]);
    expect(status('Failing')).toBe('CANCELLED');
    expect(h.alerts).toHaveLength(1);
    expect(h.alerts[0]).toMatchObject({ sessionId: 'cs_fail', memberName: 'Failing' });
    // Nobody stays checked in.
    expect(h.bookings.filter((b) => ['Lead', 'Friend', 'Cash', 'Door', 'Failing'].includes(b.id)).every((b) => b.checkedIn === false)).toBe(true);

    // Everyone booked is emailed and texted, once; the earlier-cancelled one isn't.
    expect(o.notified).toBe(5);
    expect(h.emails.map((m) => m.to).sort()).toEqual(['cash', 'door', 'failing', 'friend', 'lead'].map((n) => `${n}@example.test`));
    expect(h.sms).toHaveLength(5);
    expect(h.emails.every((m) => m.subject === 'Cancelled: Speed dating, 28-40 years')).toBe(true);
    // Only the refunded one is told about a refund.
    const lead = h.emails.find((m) => m.to === 'lead@example.test')!.html;
    expect(lead).toContain('Your payment of <strong>$88</strong> has been refunded to your card.');
    expect(h.emails.filter((m) => m.html.includes('refunded to your card'))).toHaveLength(1);
    expect(status('Gone')).toBe('CANCELLED');

    // Unpaid pages: the open one closed and dropped; the one being paid left for the webhook.
    expect(o.paymentsClosed).toBe(1);
    expect(h.dropped).toEqual(['Abandoned']);
    expect(o.paymentsArriving).toBe(1);
    expect(status('Paying')).toBe('PENDING');
  });

  it('run twice at once (a double click), nobody is refunded or told twice', async () => {
    const { cancelEvent } = await import('../cancelEvent');
    await Promise.all([cancelEvent('e1'), cancelEvent('e1')]);
    expect(h.refundCalls.filter((s) => s === 'cs_lead')).toHaveLength(1);
    expect(h.emails).toHaveLength(5);
    expect(h.sms).toHaveLength(5);
  });

  it('a payment completing for the cancelled event is refunded and the member told, once', async () => {
    const { cancelEvent, refundPaymentForCancelledEvent } = await import('../cancelEvent');
    await cancelEvent('e1');
    // Gil cancelled it himself and sees what was refunded: no email for those.
    expect(h.notices).toEqual([]);
    h.emails = []; h.sms = [];
    h.refunds.cs_paying = { outcome: 'refunded', amount: 49 };
    await refundPaymentForCancelledEvent('Paying', 'cs_paying');
    expect(h.bookings.find((b) => b.id === 'Paying')).toMatchObject({ status: 'REFUNDED', paidAmount: 49 });
    expect(h.emails).toHaveLength(1);
    expect(h.emails[0].html).toContain('Your payment of <strong>$49</strong> has been refunded to your card.');
    // The late payment is emailed to Gil, for his records (the user, 6 Oct).
    expect(h.notices).toEqual([{ why: 'cancelled', sessionId: 'cs_paying', memberName: 'Paying', memberEmail: 'paying@example.test', eventName: 'Speed dating, 28-40 years', amount: 49 }]);
    // Stripe delivers it again: refunded already, nobody emailed again.
    h.refunds.cs_paying = { outcome: 'already-refunded', amount: 49 };
    await refundPaymentForCancelledEvent('Paying', 'cs_paying');
    expect(h.emails).toHaveLength(1);
    expect(h.notices).toHaveLength(1);
  });

  it('a late payment Stripe won\'t refund: Gil is asked to refund it, not told it\'s done', async () => {
    const { cancelEvent, refundPaymentForCancelledEvent } = await import('../cancelEvent');
    await cancelEvent('e1');
    h.alerts = [];
    h.refunds.cs_paying = { outcome: 'failed', reason: 'Stripe is down' };
    await refundPaymentForCancelledEvent('Paying', 'cs_paying');
    expect(h.bookings.find((b) => b.id === 'Paying')?.status).toBe('CANCELLED');
    expect(h.alerts).toHaveLength(1);
    expect(h.alerts[0]).toMatchObject({ sessionId: 'cs_paying', memberName: 'Paying' });
    expect(h.notices).toEqual([]);
  });

  it('a payment for an event that isn\'t cancelled is none of its business', async () => {
    const { refundPaymentForCancelledEvent } = await import('../cancelEvent');
    await refundPaymentForCancelledEvent('Paying', 'cs_paying');
    expect(h.refundCalls).toEqual([]);
    expect(h.emails).toEqual([]);
  });
});
