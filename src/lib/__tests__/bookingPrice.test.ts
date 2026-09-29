import { describe, it, expect } from 'vitest';
import { priceBooking, GROUP_DISCOUNT_PER_FRIEND, type PriceInput } from '@/lib/bookingPrice';

const base: PriceInput = { cost: 49, memberName: 'Lomerov', friends: [], coupon: null, couponAlreadyUsed: false };
const henry = { name: 'Henry', gender: 'MALE' as const };

describe('priceBooking', () => {
  it('a member on their own pays the ticket price', () => {
    const q = priceBooking({ ...base });
    expect(q.total).toBe(49);
    expect(q.lines).toEqual([{ label: 'Lomerov', amount: 49 }]);
  });

  it("matches the old site's invoice: member + 1 male friend = $88, GST $8.00", () => {
    const q = priceBooking({ ...base, friends: [henry] });
    expect(q.lines).toEqual([
      { label: 'Lomerov', amount: 49 },
      { label: 'Male friend 1 – Henry', amount: 49 },
      { label: 'Group booking discount', amount: -10 },
    ]);
    expect(q.total).toBe(88);
    expect(q.gstIncluded).toBe(8);
  });

  it(`takes $${GROUP_DISCOUNT_PER_FRIEND} off per friend — two friends is $20 off`, () => {
    const q = priceBooking({ ...base, friends: [henry, { name: 'Ann', gender: 'FEMALE' }] });
    expect(q.lines.find((l) => l.label === 'Group booking discount')?.amount).toBe(-20);
    expect(q.total).toBe(49 * 3 - 20);
  });

  it('numbers male and female friends separately, like the old site', () => {
    const q = priceBooking({ ...base, friends: [henry, { name: 'Ann', gender: 'FEMALE' }, { name: 'Tom', gender: 'MALE' }] });
    expect(q.lines.map((l) => l.label)).toContain('Male friend 2 – Tom');
    expect(q.lines.map((l) => l.label)).toContain('Female friend 1 – Ann');
  });

  it('a discount code comes off on top of the group discount, on the member’s own ticket', () => {
    const q = priceBooking({ ...base, friends: [henry], coupon: { code: 'DEMO10', type: 'PERCENT_OFF', amount: 10 } });
    expect(q.lines).toContainEqual({ label: 'Discount code DEMO10', amount: -4.9 });
    expect(q.total).toBe(83.1); // 49 + 49 - 10 - 4.90
    expect(q.couponApplied).toBe(true);
  });

  it('fixed and free codes, and a fixed code bigger than the ticket stops at the ticket', () => {
    expect(priceBooking({ ...base, coupon: { code: 'F15', type: 'FIXED_REDUCTION', amount: 15 } }).total).toBe(34);
    expect(priceBooking({ ...base, coupon: { code: 'FREE', type: 'FREE', amount: null } }).total).toBe(0);
    expect(priceBooking({ ...base, coupon: { code: 'BIG', type: 'FIXED_REDUCTION', amount: 80 } }).total).toBe(0);
  });

  it('an already-used code still books, at no discount, and the summary says so', () => {
    const q = priceBooking({ ...base, friends: [henry], coupon: { code: 'FMDC10', type: 'FIXED_REDUCTION', amount: 10 }, couponAlreadyUsed: true });
    expect(q.lines).toContainEqual({ label: 'FMDC10 promotion already used', amount: null });
    expect(q.total).toBe(88);
    expect(q.couponApplied).toBe(false);
  });

  it('the per-booking amounts always add up to exactly what is charged', () => {
    for (const coupon of [null, { code: 'P', type: 'PERCENT_OFF' as const, amount: 15 }, { code: 'X', type: 'FREE' as const, amount: null }]) {
      const friends = [henry, { name: 'Ann', gender: 'FEMALE' as const }];
      const q = priceBooking({ ...base, cost: 55, friends, coupon });
      expect(Math.round((q.memberAmount + q.friendAmount * friends.length) * 100) / 100).toBe(q.total);
      expect(q.memberAmount).toBeGreaterThanOrEqual(0);
    }
  });

  it('never goes negative, even for a free-code member bringing friends to a cheap event', () => {
    const q = priceBooking({ ...base, cost: 8, friends: [henry], coupon: { code: 'X', type: 'FREE', amount: null } });
    expect(q.total).toBe(0);
    expect(q.friendAmount).toBe(0);
  });

  it('rounds to cents', () => {
    const q = priceBooking({ ...base, cost: 45, coupon: { code: 'P', type: 'PERCENT_OFF', amount: 33 } });
    expect(q.total).toBe(30.15);
    expect(q.gstIncluded).toBe(2.74);
  });
});
