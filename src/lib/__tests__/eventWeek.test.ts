import { describe, it, expect } from 'vitest';
import { eventPeriod, startOfWeek } from '@/lib/eventWeek';

/**
 * The admin events table is colour-coded by these buckets, so the week
 * boundaries have to be exact: an event on Sunday night and one on the
 * following Monday morning are hours apart but belong to different weeks.
 *
 * Dates are written without a timezone suffix so they parse as local time —
 * the same basis the helper and the table itself use.
 */
const at = (s: string) => new Date(s);

describe('startOfWeek', () => {
  it('returns the Monday of that week at midnight', () => {
    const mon = startOfWeek(at('2026-09-10T15:30:00')); // a Thursday
    expect(mon.getDay()).toBe(1);
    expect(mon.getDate()).toBe(7);
    expect(mon.getHours()).toBe(0);
    expect(mon.getMinutes()).toBe(0);
  });

  it('treats Sunday as the END of its week, not the start of the next', () => {
    // 13 Sept 2026 is a Sunday; its week began Monday the 7th.
    expect(startOfWeek(at('2026-09-13T20:00:00')).getDate()).toBe(7);
  });

  it('is idempotent — a Monday maps to itself', () => {
    const mon = at('2026-09-07T00:00:00');
    expect(startOfWeek(startOfWeek(mon)).getTime()).toBe(startOfWeek(mon).getTime());
  });
});

describe('eventPeriod', () => {
  // Monday 7 September 2026, mid-morning.
  const now = at('2026-09-07T10:00:00');

  it('calls anything already started past — including earlier today', () => {
    expect(eventPeriod(at('2026-08-30T19:00:00'), now)).toBe('past');
    expect(eventPeriod(at('2026-09-07T09:00:00'), now)).toBe('past');
  });

  it('colours the rest of the current week as this week', () => {
    expect(eventPeriod(at('2026-09-07T19:00:00'), now)).toBe('thisWeek'); // tonight
    expect(eventPeriod(at('2026-09-11T19:00:00'), now)).toBe('thisWeek'); // Friday
    expect(eventPeriod(at('2026-09-13T23:59:00'), now)).toBe('thisWeek'); // Sunday, last moment
  });

  it('colours the following Monday to Sunday as next week', () => {
    expect(eventPeriod(at('2026-09-14T00:00:00'), now)).toBe('nextWeek'); // first moment
    expect(eventPeriod(at('2026-09-16T19:00:00'), now)).toBe('nextWeek');
    expect(eventPeriod(at('2026-09-20T23:59:00'), now)).toBe('nextWeek'); // last moment
  });

  it('leaves anything beyond next week uncoloured', () => {
    expect(eventPeriod(at('2026-09-21T00:00:00'), now)).toBe('later');
    expect(eventPeriod(at('2026-12-08T19:30:00'), now)).toBe('later');
  });

  // Running the page late on a Sunday must not shift the whole table by a week.
  it('still reads Sunday as this week when today IS Sunday', () => {
    const sundayNight = at('2026-09-13T21:00:00');
    expect(eventPeriod(at('2026-09-13T23:00:00'), sundayNight)).toBe('thisWeek');
    expect(eventPeriod(at('2026-09-14T19:00:00'), sundayNight)).toBe('nextWeek');
  });
});
