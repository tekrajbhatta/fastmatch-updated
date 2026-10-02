import { describe, it, expect } from 'vitest';
import { discountAppliesTo } from '../discountScope';

const now = new Date('2026-10-05T09:00:00Z');
const code = (over: Partial<Parameters<typeof discountAppliesTo>[0]> = {}) => ({
  validFrom: new Date('2026-10-01T00:00:00Z'),
  validTo: new Date('2026-10-31T00:00:00Z'),
  scopeThemeId: null,
  scopeEventId: null,
  ...over,
});
const event = { id: 'event-a', themeId: 'theme-1' };

describe('discountAppliesTo', () => {
  it('works on every event when "All" is chosen', () => {
    expect(discountAppliesTo(code(), event, now)).toBe(true);
    expect(discountAppliesTo(code(), { id: 'event-b', themeId: 'theme-2' }, now)).toBe(true);
  });

  it('works only on the chosen event when one is picked', () => {
    expect(discountAppliesTo(code({ scopeEventId: 'event-a' }), event, now)).toBe(true);
    expect(discountAppliesTo(code({ scopeEventId: 'event-a' }), { id: 'event-b', themeId: 'theme-1' }, now)).toBe(false);
  });

  it('matches nothing once its event no longer exists', () => {
    expect(discountAppliesTo(code({ scopeEventId: 'deleted-event' }), event, now)).toBe(false);
  });

  it('still respects its dates when limited to an event', () => {
    expect(discountAppliesTo(code({ scopeEventId: 'event-a', validTo: new Date('2026-10-04T00:00:00Z') }), event, now)).toBe(false);
    expect(discountAppliesTo(code({ scopeEventId: 'event-a', validFrom: new Date('2026-10-06T00:00:00Z') }), event, now)).toBe(false);
  });

  it('keeps the event type limit working alongside the event limit', () => {
    expect(discountAppliesTo(code({ scopeThemeId: 'theme-1' }), event, now)).toBe(true);
    expect(discountAppliesTo(code({ scopeThemeId: 'theme-2' }), event, now)).toBe(false);
    expect(discountAppliesTo(code({ scopeThemeId: 'theme-1', scopeEventId: 'event-b' }), event, now)).toBe(false);
  });
});
