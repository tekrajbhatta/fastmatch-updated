import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateAge, suitsAge, approximateDateOfBirth, ageAt, birthDateRange, latestAdultDateOfBirth } from '@/lib/age';

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

describe('approximateDateOfBirth', () => {
  it('gives a birthday that reads as the age typed — on any day of the year', () => {
    for (const today of ['2026-09-28T02:00:00Z', '2026-02-10T02:00:00Z', '2026-01-01T02:00:00Z', '2026-12-31T02:00:00Z', '2028-02-29T02:00:00Z']) {
      for (const age of [18, 35, 70]) {
        const now = new Date(today);
        expect(calculateAge(approximateDateOfBirth(age, now), now), `${today} ${age}`).toBe(age);
      }
    }
  });

  it('is a plain calendar date, like every other date of birth (midnight UTC)', () => {
    const dob = approximateDateOfBirth(30, new Date('2026-10-03T02:00:00Z'));
    expect(dob.toISOString()).toBe('1996-04-03T00:00:00.000Z');
  });
});

/**
 * The birthday fix: "today" is the date in Sydney and a date of birth is a
 * calendar date, so nothing depends on the clock of the machine doing the
 * sum. The suite runs under several timezones to prove it.
 */
describe('ages count Sydney days, whatever the machine’s clock', () => {
  const dob = new Date('2008-08-25'); // turns 18 on 25 August 2026

  it('counts a birthday from midnight in Sydney (when it is still the day before in UTC)', () => {
    expect(calculateAge(dob, new Date('2026-08-24T13:59:00Z'))).toBe(17); // 11:59 pm, 24 Aug, Sydney
    expect(calculateAge(dob, new Date('2026-08-24T14:00:00Z'))).toBe(18); // midnight, 25 Aug, Sydney
  });

  it('ageAt reads the Sydney date of the moment too', () => {
    // 9 am on 25 August in Sydney is still 24 August in UTC.
    expect(ageAt(dob, new Date('2026-08-24T23:00:00Z'))).toBe(18);
    expect(ageAt(dob, new Date('2026-08-24T13:00:00Z'))).toBe(17);
  });

  it('latestAdultDateOfBirth is the birthday of someone turning 18 today in Sydney', () => {
    expect(latestAdultDateOfBirth(new Date('2026-08-24T14:00:00Z'))).toBe('2008-08-25');
    expect(latestAdultDateOfBirth(new Date('2026-08-24T13:59:00Z'))).toBe('2008-08-24');
    expect(calculateAge(new Date(`${latestAdultDateOfBirth(new Date('2028-02-29T02:00:00Z'))}`), new Date('2028-02-29T02:00:00Z'))).toBe(18);
  });
});

/**
 * Member and report filters turn an age range into a date-of-birth range for
 * the database. It must agree with calculateAge on every boundary — the old
 * one also took in people on their (max + 1)th birthday.
 */
describe('birthDateRange', () => {
  const within = (dob: Date, r: { lte?: Date; gt?: Date }) =>
    (r.lte ? dob <= r.lte : true) && (r.gt ? dob > r.gt : true);

  it('agrees with calculateAge for every birthday around the edges, leap days included', () => {
    for (const today of ['2026-10-03', '2027-02-28', '2028-02-29', '2028-03-01', '2026-12-31', '2026-01-01']) {
      const now = new Date(`${today}T02:00:00Z`); // midday-ish in Sydney
      const [ty] = today.split('-').map(Number);
      for (const [min, max] of [[18, 25], [25, 40], [30, 30], [55, 70]]) {
        const range = birthDateRange(min, max, now);
        // every day across the two edge years
        for (const y of [ty - max - 1, ty - min]) {
          for (let t = Date.UTC(y, 0, 1); t < Date.UTC(y + 1, 0, 1); t += 24 * 3600 * 1000) {
            const dob = new Date(t);
            const age = calculateAge(dob, now);
            expect(within(dob, range), `${today} ${min}-${max} born ${dob.toISOString().slice(0, 10)} age ${age}`).toBe(age >= min && age <= max);
          }
        }
      }
    }
  });

  it('leaves out someone on their 41st birthday from "up to 40"', () => {
    const now = new Date('2026-10-03T02:00:00Z');
    expect(within(new Date('1985-10-03'), birthDateRange(null, 40, now))).toBe(false);
    expect(within(new Date('1985-10-04'), birthDateRange(null, 40, now))).toBe(true);
  });

  it('only sets the bounds asked for', () => {
    expect(birthDateRange(18, null)).toEqual({ lte: expect.any(Date) });
    expect(birthDateRange(null, 40)).toEqual({ gt: expect.any(Date) });
  });
});
