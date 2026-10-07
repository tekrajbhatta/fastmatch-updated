import { describe, it, expect } from 'vitest';
import { adminEventGroup, sortAdminEvents, NEXT_WEEK_MS } from '@/lib/adminEventGroups';

const now = new Date('2026-09-28T02:00:00.000Z');
const at = (ms: number) => new Date(now.getTime() + ms);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('adminEventGroup', () => {
  it('anything already started is past — even later the same day', () => {
    expect(adminEventGroup(at(-30 * DAY), true, now)).toBe('past');
    expect(adminEventGroup(at(-1), false, now)).toBe('past');
  });

  it('confirmed only matters inside the next seven days', () => {
    expect(adminEventGroup(at(2 * DAY), true, now)).toBe('confirmedNextWeek');
    expect(adminEventGroup(at(2 * DAY), false, now)).toBe('unconfirmedNextWeek');
    expect(adminEventGroup(at(20 * DAY), true, now)).toBe('upcoming');
    expect(adminEventGroup(at(20 * DAY), false, now)).toBe('upcoming');
    expect(adminEventGroup(at(-2 * DAY), true, now)).toBe('past');
  });

  it('"next week" is the next 7 days from now, not the next calendar week', () => {
    // Monday 28 Sept: Sunday 4 Oct and Sunday-night 5 Oct (under 7 days) are both "next week".
    expect(adminEventGroup(at(6 * DAY + 20 * HOUR), false, now)).toBe('unconfirmedNextWeek');
  });

  it('boundaries: starting right now is next week; exactly seven days out is upcoming', () => {
    expect(adminEventGroup(at(0), false, now)).toBe('unconfirmedNextWeek');
    expect(adminEventGroup(at(NEXT_WEEK_MS - 1), true, now)).toBe('confirmedNextWeek');
    expect(adminEventGroup(at(NEXT_WEEK_MS), true, now)).toBe('upcoming');
  });
});

describe('sortAdminEvents', () => {
  const ev = (id: string, offset: number, confirmed = false) => ({ id, startsAt: at(offset).toISOString(), confirmed });

  it("orders confirmed-next-week, unconfirmed-next-week, upcoming, then past — Gil's order", () => {
    const sorted = sortAdminEvents(
      [
        ev('past', -3 * DAY, true),
        ev('upcoming', 30 * DAY),
        ev('unconfirmed', 1 * DAY),
        ev('confirmed', 5 * DAY, true),
      ],
      now,
    );
    expect(sorted.map((e) => e.id)).toEqual(['confirmed', 'unconfirmed', 'upcoming', 'past']);
  });

  it('soonest first within the upcoming groups, most recent first among past events', () => {
    const sorted = sortAdminEvents(
      [
        ev('up-later', 60 * DAY), ev('up-sooner', 10 * DAY),
        ev('past-old', -90 * DAY), ev('past-recent', -2 * DAY),
        ev('nw-later', 6 * DAY, true), ev('nw-sooner', 1 * DAY, true),
      ],
      now,
    );
    expect(sorted.map((e) => e.id)).toEqual(['nw-sooner', 'nw-later', 'up-sooner', 'up-later', 'past-recent', 'past-old']);
  });

  it('does not mutate the array it was given', () => {
    const input = [ev('b', 20 * DAY), ev('a', -1 * DAY)];
    const copy = [...input];
    sortAdminEvents(input, now);
    expect(input).toEqual(copy);
  });

  it('a cancelled event, or a copy not saved yet, is grey and after the upcoming ones, not "in the next week" (batch 13)', () => {
    const cancelled = { ...ev('cancelled', 2 * DAY, true), status: 'CANCELLED' };
    const draft = { ...ev('draft', 3 * DAY), draft: true };
    const sorted = sortAdminEvents([cancelled, draft, ev('up', 20 * DAY), ev('nw', 1 * DAY, true), ev('past', -1 * DAY)], now);
    expect(sorted.map((e) => e.id)).toEqual(['nw', 'up', 'cancelled', 'draft', 'past']);
    expect(adminEventGroup(new Date(now.getTime() + 2 * DAY), true, now, true)).toBe('inactive');
    // Once it has happened (or would have), it's simply past.
    expect(adminEventGroup(new Date(now.getTime() - DAY), true, now, true)).toBe('past');
  });
});

