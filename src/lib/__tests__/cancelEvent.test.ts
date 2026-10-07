import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Gil round 2, batch 6 (G1): cancelling an event refunds card payments made
 * online and tells everyone (Gil, Q2-Q4); hiding is separate. Stripe, the
 * database, email and SMS are stood in for.
 */
const h = vi.hoisted(() => ({
  stripe: {
    session: null as any,
    refundError: null as any,
    created: [] as { params: any; opts: any }[],
  },
  db: {
    event: null as any,
    bookings: [] as any[],
    updates: [] as any[],
    claimed: new Set<string>(),
  },
  emails: [] as { to: string; subject: string; html: string }[],
  sms: [] as { to: string; body: string }[],
  alerts: [] as any[],
  close: {} as Record<string, 'paid' | 'closed'>,
  dropped: [] as string[],
  refundResult: {} as Record<string, any>,
}));

vi.mock('../stripe', () => ({
  STRIPE_SITE_TAG: 'fastmatch.com.au',
  getStripe: () => ({
    checkout: { sessions: { retrieve: async () => h.stripe.session } },
    refunds: {
      create: async (params: any, opts: any) => {
        h.stripe.created.push({ params, opts });
        if (h.stripe.refundError) throw h.stripe.refundError;
        return { id: 're_1', amount: 4900, status: 'succeeded' };
      },
    },
  }),
}));

describe('refundCheckoutSession: the first automatic refunds', () => {
  beforeEach(() => { h.stripe.created = []; h.stripe.refundError = null; });
  const paid = (refunded = false) => ({
    id: 'cs_1', payment_status: 'paid', amount_total: 4900,
    payment_intent: { id: 'pi_1', latest_charge: { refunded, amount: 4900, amount_refunded: refunded ? 4900 : 0 } },
  });

  it('refunds a paid payment page in full, once, saying why', async () => {
    const { refundCheckoutSession } = await import('../refunds');
    h.stripe.session = paid();
    expect(await refundCheckoutSession('cs_1', { bookingId: 'b1', reason: 'event_cancelled' })).toEqual({ outcome: 'refunded', amount: 49 });
    expect(h.stripe.created).toHaveLength(1);
    expect(h.stripe.created[0].params).toEqual({ payment_intent: 'pi_1', metadata: { site: 'fastmatch.com.au', bookingId: 'b1', reason: 'event_cancelled' } });
    // The same key every time for this payment: Stripe never refunds it twice.
    expect(h.stripe.created[0].opts).toEqual({ idempotencyKey: 'fastmatch-refund-cs_1' });
  });

  it('doesn\'t refund what has been refunded already (by hand in Stripe, or a retry)', async () => {
    const { refundCheckoutSession } = await import('../refunds');
    h.stripe.session = paid(true);
    expect(await refundCheckoutSession('cs_1', { bookingId: 'b1', reason: 'x' })).toEqual({ outcome: 'already-refunded', amount: 49 });
    expect(h.stripe.created).toHaveLength(0);
    h.stripe.session = paid();
    h.stripe.refundError = Object.assign(new Error('Charge already refunded'), { code: 'charge_already_refunded' });
    expect(await refundCheckoutSession('cs_1', { bookingId: 'b1', reason: 'x' })).toEqual({ outcome: 'already-refunded', amount: 49 });
  });

  it('has nothing to refund on an unpaid page, and reports a failure without throwing', async () => {
    const { refundCheckoutSession } = await import('../refunds');
    h.stripe.session = { id: 'cs_1', payment_status: 'unpaid', payment_intent: null };
    expect(await refundCheckoutSession('cs_1', { bookingId: 'b1', reason: 'x' })).toEqual({ outcome: 'not-paid' });
    h.stripe.session = paid();
    h.stripe.refundError = new Error('Your card was declined for refund');
    expect(await refundCheckoutSession('cs_1', { bookingId: 'b1', reason: 'x' })).toEqual({ outcome: 'failed', reason: 'Your card was declined for refund' });
  });
});

describe('cancelBlocked', () => {
  it('only an event not cancelled whose night isn\'t over can be cancelled', async () => {
    const { cancelBlocked } = await import('../cancelEvent');
    const now = new Date('2026-10-10T09:00:00Z'); // 8 pm in Sydney
    const sydney = { name: 'Sydney' };
    expect(cancelBlocked({ status: 'UPCOMING', startsAt: new Date('2026-10-20T08:30:00Z'), city: sydney }, now)).toBeNull();
    // Started this evening: still the night, so it can still be called off.
    expect(cancelBlocked({ status: 'UPCOMING', startsAt: new Date('2026-10-10T08:30:00Z'), city: sydney }, now)).toBeNull();
    expect(cancelBlocked({ status: 'UPCOMING', startsAt: new Date('2026-10-09T08:30:00Z'), city: sydney }, now)).toMatch(/already happened/);
    expect(cancelBlocked({ status: 'CANCELLED', startsAt: new Date('2026-10-20T08:30:00Z'), city: sydney }, now)).toMatch(/already been cancelled/);
  });

  it('a cancellation that stopped part-way can be finished, whenever that\'s noticed (batch 11)', async () => {
    const { cancelBlocked } = await import('../cancelEvent');
    const now = new Date('2026-10-10T09:00:00Z');
    const sydney = { name: 'Sydney' };
    // Two people still booked on a cancelled event: finishing is allowed, even after the night.
    expect(cancelBlocked({ status: 'CANCELLED', startsAt: new Date('2026-10-20T08:30:00Z'), city: sydney }, now, 2)).toBeNull();
    expect(cancelBlocked({ status: 'CANCELLED', startsAt: new Date('2026-10-09T08:30:00Z'), city: sydney }, now, 2)).toBeNull();
  });
});

describe('the cancellation email and text', () => {
  const change = {
    eventName: 'Speed dating, 28-40 years', themeName: 'Speed dating', ageMin: 28, ageMax: 40, oldVenue: 'Soultrap', newVenue: 'Soultrap', newVenueFull: 'Soultrap',
    oldStartsAt: new Date('2026-11-14T08:30:00Z'), newStartsAt: new Date('2026-11-14T08:30:00Z'), venueChanged: false, timeChanged: false, cancelled: true, timeZone: 'Australia/Sydney',
  };
  it('says what was refunded to their card, only when something was', async () => {
    const { eventChangeEmail, eventChangeSms } = await import('../emails/eventEmails');
    const refunded = eventChangeEmail({ ...change, memberName: 'Ann', refunded: 104 }).html;
    expect(refunded).toContain('Your payment of <strong>$104</strong> has been refunded to your card.');
    expect(eventChangeEmail({ ...change, memberName: 'Ann' }).html).not.toContain('refunded');
    // The text is Gil's, unchanged: one SMS.
    expect(eventChangeSms(change)).toBe('Your fastmatch event on 14/11/26 at 7.30pm at Soultrap has been cancelled. Sorry for the inconvenience. gil@fastmatch.com.au');
  });
});

describe('bookingStatusLabel', () => {
  it('"Cancelled – refunded" for a refund, "Cancelled" otherwise (the user, 6 Oct)', async () => {
    const { bookingStatusLabel } = await import('../paymentMethod');
    expect(bookingStatusLabel('REFUNDED', '$49')).toBe('Cancelled – refunded');
    expect(bookingStatusLabel('CANCELLED', '$49')).toBe('Cancelled');
    expect(bookingStatusLabel('CONFIRMED', '$49')).toBe('Paid $49');
    expect(bookingStatusLabel('PENDING', '$49')).toBe('Pending');
  });
});
