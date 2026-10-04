import { describe, it, expect } from 'vitest';
import { endOfEventNight, checkInWindow, checkInState, choicesOpen } from '@/lib/eventNight';
import { instantFromWallTime } from '@/lib/zonedTime';

// Gil: check-in from an hour before the start until midnight; choices until
// midnight ("bad luck" after that), or until the results are worked out.
const sydney = { startsAt: instantFromWallTime('2026-10-09T19:30', 'Australia/Sydney'), city: { name: 'Sydney' } };
const perth = { startsAt: instantFromWallTime('2026-10-09T19:30', 'Australia/Perth'), city: { name: 'Perth' } };
const at = (wall: string, tz = 'Australia/Sydney') => instantFromWallTime(wall, tz);

describe('the event night', () => {
  it('ends at midnight at the end of the event’s day, on its city’s clock', () => {
    expect(endOfEventNight(sydney).toISOString()).toBe(at('2026-10-10T00:00').toISOString());
    expect(endOfEventNight(perth).toISOString()).toBe(at('2026-10-10T00:00', 'Australia/Perth').toISOString());
  });

  it('opens check-in an hour before the start', () => {
    expect(checkInWindow(sydney).opens.toISOString()).toBe(at('2026-10-09T18:30').toISOString());
    expect(checkInState(sydney, at('2026-10-09T18:29'))).toBe('not-yet');
    expect(checkInState(sydney, at('2026-10-09T18:30'))).toBe('open');
    expect(checkInState(sydney, at('2026-10-09T23:59'))).toBe('open');
    expect(checkInState(sydney, at('2026-10-10T00:00'))).toBe('closed');
    expect(checkInState(sydney, at('2026-10-02T19:30'))).toBe('not-yet'); // a week early
  });

  it('uses the Perth clock for a Perth event, not Sydney’s', () => {
    // 11:30 pm in Perth is 2:30 am the next day in Sydney: still open in Perth.
    expect(checkInState(perth, at('2026-10-09T23:30', 'Australia/Perth'))).toBe('open');
  });

  it('closes choices at midnight, or once the results are worked out', () => {
    expect(choicesOpen({ ...sydney, matchesCalculated: false }, at('2026-10-09T23:59'))).toBe(true);
    expect(choicesOpen({ ...sydney, matchesCalculated: false }, at('2026-10-10T00:00'))).toBe(false);
    expect(choicesOpen({ ...sydney, matchesCalculated: true }, at('2026-10-09T21:00'))).toBe(false);
  });

  it('an event starting late still closes at that midnight', () => {
    const late = { startsAt: at('2026-10-09T23:30'), city: { name: 'Sydney' } };
    expect(endOfEventNight(late).toISOString()).toBe(at('2026-10-10T00:00').toISOString());
  });
});
