import { describe, it, expect } from 'vitest';
import { discountInputSchema, checkDiscountInput, discountAmountProblem } from '@/lib/discountInput';

const base = { code: ' xmas10 ', type: 'PERCENT_OFF' as const, amount: 10, scopeEventId: '', validFrom: '2026-12-01', validTo: '2026-12-31' };
const check = (over: Record<string, unknown>) => checkDiscountInput(discountInputSchema.parse({ ...base, ...over }));

describe('discount code checks (create and edit alike)', () => {
  it('accepts a sensible code, upper-cased and trimmed', () => {
    const r = check({});
    expect(r.ok && r.data).toMatchObject({ code: 'XMAS10', type: 'PERCENT_OFF', amount: 10, scopeEventId: null });
  });

  it('percent off: 1 to 100, and required', () => {
    expect(discountAmountProblem('PERCENT_OFF', 0)).toMatch(/between 1 and 100/);
    expect(discountAmountProblem('PERCENT_OFF', 101)).toMatch(/between 1 and 100/);
    expect(discountAmountProblem('PERCENT_OFF', 100)).toBeNull();
    expect(discountAmountProblem('PERCENT_OFF', null)).toMatch(/percentage off/);
    expect(check({ amount: null })).toEqual({ ok: false, error: 'Please enter the percentage off (1 to 100).' });
  });

  it('fixed reduction: more than $0, and required', () => {
    expect(discountAmountProblem('FIXED_REDUCTION', 0)).toMatch(/more than \$0/);
    expect(discountAmountProblem('FIXED_REDUCTION', -5)).toMatch(/more than \$0/);
    expect(discountAmountProblem('FIXED_REDUCTION', 12.5)).toBeNull();
    expect(discountAmountProblem('FIXED_REDUCTION', undefined)).toMatch(/amount off/);
  });

  it('free: no amount stored, whatever was sent', () => {
    const r = check({ type: 'FREE', amount: 50 });
    expect(r.ok && r.data.amount).toBeNull();
  });

  it('dates must be real, and in order', () => {
    expect(check({ validTo: '2026-11-30' })).toEqual({ ok: false, error: '"Valid to" can\'t be before "Valid from".' });
    expect(check({ validFrom: 'soon' }).ok).toBe(false);
  });

  it('a code must be given', () => {
    expect(discountInputSchema.safeParse({ ...base, code: '  ' }).success).toBe(false);
  });

  it('"Event type": empty is All, and choosing one event clears it (the event has its own type)', () => {
    const all = check({ scopeThemeId: '' });
    expect(all.ok && all.data.scopeThemeId).toBeNull();
    const typed = check({ scopeThemeId: 'theme-1' });
    expect(typed.ok && typed.data).toMatchObject({ scopeThemeId: 'theme-1', scopeEventId: null });
    const oneEvent = check({ scopeThemeId: 'theme-1', scopeEventId: 'event-1' });
    expect(oneEvent.ok && oneEvent.data).toMatchObject({ scopeThemeId: null, scopeEventId: 'event-1' });
  });
});
