import { describe, it, expect } from 'vitest';
import { discountValidity, discountDay, formatDiscountDay } from '@/lib/discountDates';
import { discountAppliesTo } from '@/lib/discountScope';

/**
 * A code's dates are whole days in Sydney. They were stored as midnight UTC
 * (10–11 am in Sydney), so a code stopped working on the morning of its last
 * advertised day.
 */
describe('discountValidity', () => {
  it('runs from midnight on the first day to the last millisecond of the last, Sydney time', () => {
    const v = discountValidity('2026-10-01', '2026-10-31')!;
    expect(v.validFrom.toISOString()).toBe('2026-09-30T14:00:00.000Z'); // 12:00 am 1 Oct (UTC+10)
    expect(v.validTo.toISOString()).toBe('2026-10-31T12:59:59.999Z'); // 11:59:59.999 pm 31 Oct (UTC+11)
  });

  it('still works on the evening of its last day — the bug', () => {
    const code = { ...discountValidity('2026-10-01', '2026-10-31')!, scopeThemeId: null, scopeEventId: null };
    const event = { id: 'e1', themeId: 't1' };
    expect(discountAppliesTo(code, event, new Date('2026-10-31T09:00:00Z'))).toBe(true); // 8 pm, 31 Oct, Sydney
    expect(discountAppliesTo(code, event, new Date('2026-10-31T13:00:00Z'))).toBe(false); // midnight, 1 Nov
    expect(discountAppliesTo(code, event, new Date('2026-09-30T13:59:59Z'))).toBe(false); // 11:59 pm, 30 Sep
    expect(discountAppliesTo(code, event, new Date('2026-09-30T14:00:00Z'))).toBe(true); // midnight, 1 Oct
  });

  it('allows a single day', () => {
    const v = discountValidity('2026-10-09', '2026-10-09')!;
    expect(v.validTo.getTime() - v.validFrom.getTime()).toBe(24 * 3600 * 1000 - 1);
  });

  it('refuses anything that isn’t a real date', () => {
    for (const [from, to] of [['', '2026-10-09'], ['2026-10-09', ''], ['2026-02-30', '2026-03-01'], ['2026-03-01', '2026-02-30'], ['9/10/2026', '2026-10-09']]) {
      expect(discountValidity(from, to), `${from} ${to}`).toBeNull();
    }
  });
});

describe('discountDay / formatDiscountDay', () => {
  it('reads back the Sydney day that was chosen, for both ends', () => {
    const v = discountValidity('2026-10-01', '2026-10-31')!;
    expect(discountDay(v.validFrom)).toBe('2026-10-01');
    expect(discountDay(v.validTo.toISOString())).toBe('2026-10-31');
    expect(formatDiscountDay(v.validFrom)).toBe('01/10/2026');
    expect(formatDiscountDay(v.validTo)).toBe('31/10/2026');
  });

  it('reads codes saved the old way (midnight UTC) as the same day', () => {
    expect(discountDay('2026-10-31T00:00:00.000Z')).toBe('2026-10-31');
  });
});
