import { describe, it, expect } from 'vitest';
import { PAYMENT_METHODS, paymentMethodLabel } from '@/lib/paymentMethod';

describe('payment methods', () => {
  it("offers exactly Gil's four options, in his order", () => {
    expect(PAYMENT_METHODS.map((m) => m.label)).toEqual(['Cash', 'Charge credit card', 'Pay at door', 'Friend booked in']);
  });

  it('labels a booking with no method as an online booking', () => {
    expect(paymentMethodLabel(null)).toBe('Online');
    expect(paymentMethodLabel(undefined)).toBe('Online');
  });

  it('uses short labels in the bookings table', () => {
    expect(paymentMethodLabel('CARD')).toBe('Credit card');
    expect(paymentMethodLabel('PAY_AT_DOOR')).toBe('Pay at door');
  });
});
