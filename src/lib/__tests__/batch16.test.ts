import { describe, it, expect } from 'vitest';
import { hasStripePayment, stripePaymentUrl } from '@/lib/stripePayment';
import { countOf } from '@/lib/plural';
import { discountAppliesTo } from '@/lib/discountScope';

describe('the Stripe payment behind a booking', () => {
  const paidOnline = { status: 'CONFIRMED', paymentMethod: null, stripePaymentIntentId: 'cs_test_1', confirmedAt: '2026-10-08T09:00:00Z' };

  it('shows for a booking paid by card on the site, and still after a refund', () => {
    expect(hasStripePayment(paidOnline)).toBe(true);
    expect(hasStripePayment({ ...paidOnline, status: 'REFUNDED' })).toBe(true);
  });

  it('not while it is unpaid, nor for one paid another way or never confirmed', () => {
    expect(hasStripePayment({ ...paidOnline, status: 'PENDING' })).toBe(false);
    expect(hasStripePayment({ ...paidOnline, paymentMethod: 'CASH' })).toBe(false);
    expect(hasStripePayment({ ...paidOnline, confirmedAt: null })).toBe(false);
    expect(hasStripePayment({ ...paidOnline, stripePaymentIntentId: null })).toBe(false);
  });

  it("a friend's place: the payment of the member who brought them", () => {
    const friend = { status: 'CONFIRMED', paymentMethod: null, stripePaymentIntentId: null, confirmedAt: null };
    expect(hasStripePayment({ ...friend, bookedBy: paidOnline })).toBe(true);
    expect(hasStripePayment({ ...friend, bookedBy: { ...paidOnline, paymentMethod: 'CASH' } })).toBe(false);
  });

  it("links to the payment's page in the Dashboard, test payments under /test/", () => {
    expect(stripePaymentUrl('pi_123', false)).toBe('https://dashboard.stripe.com/test/payments/pi_123');
    expect(stripePaymentUrl('pi_123', true)).toBe('https://dashboard.stripe.com/payments/pi_123');
  });
});

describe('counts on screen', () => {
  it('one or many', () => {
    expect(countOf(1, 'man', 'men')).toBe('1 man');
    expect(countOf(0, 'man', 'men')).toBe('0 men');
    expect(countOf(2, 'pair', 'pairs')).toBe('2 pairs');
    expect(countOf(1250, 'member', 'members')).toBe('1,250 members');
  });
});

describe('a discount code limited to one event type', () => {
  const now = new Date('2026-10-08T10:00:00Z');
  const code = { validFrom: new Date('2026-10-01T00:00:00Z'), validTo: new Date('2026-10-31T00:00:00Z'), scopeThemeId: 'wine', scopeEventId: null };
  it('works only for events of that type', () => {
    expect(discountAppliesTo(code, { id: 'e1', themeId: 'wine' }, now)).toBe(true);
    expect(discountAppliesTo(code, { id: 'e2', themeId: 'dogs' }, now)).toBe(false);
  });
});
