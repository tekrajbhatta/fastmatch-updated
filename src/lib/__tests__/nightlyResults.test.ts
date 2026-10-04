import { describe, it, expect } from 'vitest';
import { eventsDueForResults, resultsDue, RESULTS_LOOK_BACK_DAYS } from '@/lib/nightlyResults';
import { instantFromWallTime } from '@/lib/zonedTime';

/**
 * The nightly results job. It used to look for events that started between
 * the server's last midnight and "now" — at midnight, nothing — so results
 * never went out. Now: events from the last week whose choices have closed,
 * which is midnight on the event city's own clock (Gil).
 */
const at = (wall: string, tz = 'Australia/Sydney') => instantFromWallTime(wall, tz);
const range = (now: Date) => eventsDueForResults(now).startsAt as { gte: Date; lt: Date };
const sydneyFriday = { startsAt: at('2026-10-09T19:30'), city: { name: 'Sydney' } };
const perthFriday = { startsAt: at('2026-10-09T19:30', 'Australia/Perth'), city: { name: 'Perth' } };

describe('eventsDueForResults / resultsDue', () => {
  it('at Sydney midnight, picks up the Sydney evening just gone', () => {
    const now = at('2026-10-10T00:00');
    const r = range(now);
    expect(sydneyFriday.startsAt >= r.gte && sydneyFriday.startsAt < r.lt).toBe(true);
    expect(resultsDue(sydneyFriday, now)).toBe(true);
    expect(resultsDue(sydneyFriday, at('2026-10-09T23:59'))).toBe(false); // choices still open
  });

  it('waits for a Perth event until midnight in Perth (its members can still send choices)', () => {
    expect(resultsDue(perthFriday, at('2026-10-10T00:00'))).toBe(false); // 9 pm in Perth
    expect(resultsDue(perthFriday, at('2026-10-10T00:00', 'Australia/Perth'))).toBe(true);
  });

  it('never picks up an event that hasn’t started', () => {
    const now = at('2026-10-10T00:05');
    expect(at('2026-10-10T19:30') < range(now).lt).toBe(false);
  });

  it('looks back a week for events a missed run left behind, and no further', () => {
    const r = range(at('2026-10-10T00:05'));
    expect(r.gte.toISOString()).toBe(at('2026-10-03T00:00').toISOString());
    expect(RESULTS_LOOK_BACK_DAYS).toBe(7);
  });

  it('skips calculated, cancelled and draft events', () => {
    const where = eventsDueForResults(at('2026-10-10T00:05'));
    expect(where.matchesCalculated).toBe(false);
    expect(where.draft).toBe(false);
    expect(where.status).toEqual({ not: 'CANCELLED' });
  });
});
