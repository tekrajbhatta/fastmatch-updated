import { describe, it, expect } from 'vitest';
import { commissionFor, affiliateInputSchema, checkAffiliateInput } from '@/lib/affiliates';
import { groupCommissionLines, type CommissionLine } from '@/lib/reports/commissions';
import { REPORT_TYPES, reportProblem } from '@/lib/reports/breakdown';

/**
 * Affiliates (Gil, Nov; his answers 14 Nov): a promotion is a discount code
 * with a commission, a % of the event's cost, once for each booking made
 * with it; reported with a total for each affiliate and at the bottom.
 */

describe('the commission', () => {
  it("is the affiliate's % of the event's cost, to the cent", () => {
    expect(commissionFor(50, 20)).toBe(10);
    expect(commissionFor(49, 15)).toBe(7.35);
    expect(commissionFor(55, 12.5)).toBe(6.88);
  });
});

describe('the promotion form', () => {
  const base = { affiliateName: ' RSVP ', commissionPercent: 20, code: 'rsvp10', type: 'FIXED_REDUCTION' as const, amount: 10, validFrom: '2026-11-14', validTo: '2026-12-31' };

  it("takes Gil's fields: name, commission, code, % or $ off, dates", () => {
    const checked = checkAffiliateInput(affiliateInputSchema.parse(base));
    expect(checked.ok && checked.affiliateName).toBe('RSVP');
    expect(checked.ok && checked.commissionPercent).toBe(20);
    expect(checked.ok && checked.code).toMatchObject({ code: 'RSVP10', type: 'FIXED_REDUCTION', amount: 10, scopeEventId: null, scopeThemeId: null });
  });

  it('refuses what makes no sense', () => {
    expect(affiliateInputSchema.safeParse({ ...base, type: 'FREE' }).success).toBe(false);
    expect(affiliateInputSchema.safeParse({ ...base, commissionPercent: 0 }).success).toBe(false);
    expect(affiliateInputSchema.safeParse({ ...base, commissionPercent: 101 }).success).toBe(false);
    expect(affiliateInputSchema.safeParse({ ...base, affiliateName: '  ' }).success).toBe(false);
    const noAmount = checkAffiliateInput(affiliateInputSchema.parse({ ...base, amount: null }));
    expect(!noAmount.ok && noAmount.error).toMatch(/amount off/);
    const tooMuch = checkAffiliateInput(affiliateInputSchema.parse({ ...base, type: 'PERCENT_OFF', amount: 120 }));
    expect(!tooMuch.ok && tooMuch.error).toMatch(/between 1 and 100/);
    const backwards = checkAffiliateInput(affiliateInputSchema.parse({ ...base, validFrom: '2026-12-31', validTo: '2026-11-14' }));
    expect(!backwards.ok && backwards.error).toMatch(/can't be before/);
  });
});

describe('the report', () => {
  const line = (over: Partial<CommissionLine>): CommissionLine => ({
    bookingId: Math.random().toString(36), affiliate: 'RSVP', event: 'Professional speed dating, 25 to 37 years', eventNumber: 1,
    startsAt: '2026-06-23T09:00:00.000Z', location: 'Sydney', eventCost: 50, code: 'RSVP10', percent: 20, commission: 10, ...over,
  });

  it('groups by affiliate, A to Z, each by event date, with subtotals and a total at the bottom', () => {
    const r = groupCommissionLines([
      line({ affiliate: 'Yes Dating', commission: 7.35, startsAt: '2026-07-01T09:00:00.000Z' }),
      line({ startsAt: '2026-07-10T09:00:00.000Z', eventNumber: 3 }),
      line({}),
    ]);
    expect(r.groups.map((g) => [g.affiliate, g.bookings, g.total])).toEqual([['RSVP', 2, 20], ['Yes Dating', 1, 7.35]]);
    expect(r.groups[0].lines.map((l) => l.startsAt.slice(0, 10))).toEqual(['2026-06-23', '2026-07-10']);
    expect(r).toMatchObject({ bookings: 3, total: 27.35 });
    expect(groupCommissionLines([])).toEqual({ groups: [], bookings: 0, total: 0 });
  });

  it('is a report type of its own, with no categorise/group or age/gender rules', () => {
    expect(REPORT_TYPES.map((t) => t.label)).toContain('Commissions due to affiliates');
    expect(reportProblem({ category: 'month', group: 'month', type: 'commissions', memberFilters: true })).toBeNull();
  });
});
