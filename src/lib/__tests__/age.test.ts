import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateAge } from '@/lib/age';

/**
 * The event age-range check and the 18+ registration check both hinge on
 * this, so the boundary days matter: the day before a birthday and the
 * birthday itself decide whether someone can register or book at all.
 *
 * Time is frozen so "today" can't drift between runs.
 */
function freeze(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe('calculateAge', () => {
  afterEach(() => vi.useRealTimers());

  it('counts a birthday that has already passed this year', () => {
    freeze('2026-08-25T12:00:00Z');
    expect(calculateAge(new Date('2000-03-10'))).toBe(26);
  });

  it('does NOT count a birthday still to come this year', () => {
    freeze('2026-08-25T12:00:00Z');
    expect(calculateAge(new Date('2000-12-10'))).toBe(25);
  });

  it('is exact on the birthday itself', () => {
    freeze('2026-08-25T12:00:00Z');
    expect(calculateAge(new Date('2008-08-25'))).toBe(18);
  });

  it('is one year less the day before the birthday', () => {
    freeze('2026-08-24T12:00:00Z');
    expect(calculateAge(new Date('2008-08-25'))).toBe(17);
  });

  // The old `(now - dob) / (365.25 * day)` approximation this replaced drifts
  // by a day around leap years, which is exactly where an 18th birthday can
  // be misjudged.
  it('handles a 29 February birthday without drifting', () => {
    freeze('2026-02-28T12:00:00Z');
    expect(calculateAge(new Date('2008-02-29'))).toBe(17);
    freeze('2026-03-01T12:00:00Z');
    expect(calculateAge(new Date('2008-02-29'))).toBe(18);
  });
});

/**
 * The booking rule itself, as implemented in
 * src/app/api/events/[eventId]/book/route.ts:
 *   age < event.ageMin || age > event.ageMax  ->  rejected
 * Both bounds are INCLUSIVE.
 */
function isBookable(dob: Date, ageMin: number, ageMax: number) {
  const age = calculateAge(dob);
  return !(age < ageMin || age > ageMax);
}

describe('event age-range rule', () => {
  afterEach(() => vi.useRealTimers());

  it('accepts someone exactly on the lower bound', () => {
    freeze('2026-08-25T12:00:00Z');
    expect(isBookable(new Date('1996-08-25'), 30, 45)).toBe(true); // turns 30 today
  });

  it('accepts someone exactly on the upper bound', () => {
    freeze('2026-08-25T12:00:00Z');
    expect(isBookable(new Date('1981-08-25'), 30, 45)).toBe(true); // turns 45 today
  });

  it('rejects someone one day short of the lower bound', () => {
    freeze('2026-08-24T12:00:00Z');
    expect(isBookable(new Date('1996-08-25'), 30, 45)).toBe(false); // still 29
  });

  it('rejects someone who has aged past the upper bound', () => {
    freeze('2026-08-25T12:00:00Z');
    expect(isBookable(new Date('1980-08-25'), 30, 45)).toBe(false); // 46
  });
});
