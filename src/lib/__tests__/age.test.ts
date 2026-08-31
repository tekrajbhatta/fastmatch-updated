import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateAge, suitsAge } from '@/lib/age';

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

/**
 * The events-page suggestion rule: an event is suggested when the member's
 * age falls within the event's range widened by AGE_SUGGESTION_MARGIN either
 * side. Gil's example wording was "10 years above below age range".
 */
describe('suitsAge — events-page suggestions', () => {
  const ev = (ageMin: number, ageMax: number) => ({ ageMin, ageMax });

  it('suggests an event whose range contains the member', () => {
    expect(suitsAge(ev(25, 35), 30)).toBe(true);
  });

  it('suggests an event up to 10 years above the member', () => {
    expect(suitsAge(ev(40, 50), 35)).toBe(true);   // 35 >= 40-10
    expect(suitsAge(ev(46, 60), 35)).toBe(false);  // 35 < 46-10
  });

  it('suggests an event up to 10 years below the member', () => {
    expect(suitsAge(ev(18, 30), 40)).toBe(true);   // 40 <= 30+10
    expect(suitsAge(ev(18, 29), 40)).toBe(false);  // 40 > 29+10
  });

  it('is inclusive exactly on both widened boundaries', () => {
    expect(suitsAge(ev(30, 40), 20)).toBe(true);   // exactly ageMin-10
    expect(suitsAge(ev(30, 40), 50)).toBe(true);   // exactly ageMax+10
    expect(suitsAge(ev(30, 40), 19)).toBe(false);  // one year outside
    expect(suitsAge(ev(30, 40), 51)).toBe(false);
  });

  it("matches Gil's worked example for a 35-year-old", () => {
    expect(suitsAge(ev(25, 35), 35)).toBe(true);
    expect(suitsAge(ev(40, 50), 35)).toBe(true);
    expect(suitsAge(ev(50, 65), 35)).toBe(false);
    expect(suitsAge(ev(18, 24), 35)).toBe(false);
  });

  // The suggestion window is wider than the booking rule on purpose, so some
  // suggested events are legitimately refused at booking. Locked in so nobody
  // "fixes" one to match the other without meaning to.
  it('is deliberately wider than the booking age check', () => {
    const event = ev(40, 50);
    const age = 35;
    expect(suitsAge(event, age)).toBe(true);                       // suggested
    expect(age < event.ageMin || age > event.ageMax).toBe(true);   // but NOT bookable
  });
});
