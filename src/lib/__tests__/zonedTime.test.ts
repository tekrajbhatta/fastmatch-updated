import { describe, it, expect } from 'vitest';
import { wallTimeIn, dateIn, instantFromWallTime, addDays, addMonths, startOfDayIn, endOfDayIn } from '@/lib/zonedTime';

/**
 * Event times are entered and shown on the event CITY's clock. These lock in
 * the conversion both ways, including the two daylight-saving changes a year
 * and the cities that don't follow Sydney (Brisbane never changes, Adelaide is
 * half an hour behind, Perth two or three hours). None of it may depend on
 * the timezone of the machine running it: the suite is run under several.
 */
const SYD = 'Australia/Sydney';
const PER = 'Australia/Perth';
const BNE = 'Australia/Brisbane';
const ADL = 'Australia/Adelaide';
const iso = (d: Date) => d.toISOString();

describe('instantFromWallTime', () => {
  it('reads a wall time on the given city’s clock, not the machine’s', () => {
    // 7 pm on Friday 9 October 2026 (Sydney and Adelaide on daylight saving)
    expect(iso(instantFromWallTime('2026-10-09T19:00', SYD))).toBe('2026-10-09T08:00:00.000Z'); // UTC+11
    expect(iso(instantFromWallTime('2026-10-09T19:00', BNE))).toBe('2026-10-09T09:00:00.000Z'); // UTC+10, no DST
    expect(iso(instantFromWallTime('2026-10-09T19:00', ADL))).toBe('2026-10-09T08:30:00.000Z'); // UTC+10:30
    expect(iso(instantFromWallTime('2026-10-09T19:00', PER))).toBe('2026-10-09T11:00:00.000Z'); // UTC+8
    // ...and in winter
    expect(iso(instantFromWallTime('2026-07-10T19:00', SYD))).toBe('2026-07-10T09:00:00.000Z'); // UTC+10
    expect(iso(instantFromWallTime('2026-07-10T19:00', ADL))).toBe('2026-07-10T09:30:00.000Z'); // UTC+9:30
  });

  it('fixes the original bug: a Perth 7 pm entered from Sydney stays 7 pm in Perth', () => {
    const at = instantFromWallTime('2026-11-13T19:00', PER);
    expect(wallTimeIn(at, PER)).toBe('2026-11-13T19:00');
    expect(wallTimeIn(at, SYD)).toBe('2026-11-13T22:00'); // what Sydney clocks read at that moment
  });

  it('treats a bare date as midnight', () => {
    expect(iso(instantFromWallTime('2026-07-10', SYD))).toBe('2026-07-09T14:00:00.000Z');
  });

  it('accepts seconds from inputs that send them, and ignores them', () => {
    expect(iso(instantFromWallTime('2026-07-10T19:00:00', SYD))).toBe('2026-07-10T09:00:00.000Z');
  });

  it('moves a time skipped by the clocks going forward on by the gap', () => {
    // Sydney, Sunday 4 October 2026: 2:00 am becomes 3:00 am.
    const at = instantFromWallTime('2026-10-04T02:30', SYD);
    expect(wallTimeIn(at, SYD)).toBe('2026-10-04T03:30');
    expect(iso(at)).toBe('2026-10-03T16:30:00.000Z');
  });

  it('takes the first of a time that happens twice when clocks go back', () => {
    // Sydney, Sunday 5 April 2026: 3:00 am becomes 2:00 am, so 2:30 am happens twice.
    expect(iso(instantFromWallTime('2026-04-05T02:30', SYD))).toBe('2026-04-04T15:30:00.000Z'); // the +11 one
  });

  it('refuses anything malformed or impossible', () => {
    for (const bad of ['', 'nonsense', '2026-02-30T19:00', '2026-13-01T19:00', '2026-10-09T24:00', '2026-10-09T19:60', '9/10/2026 7pm']) {
      expect(Number.isNaN(instantFromWallTime(bad, SYD).getTime()), bad).toBe(true);
    }
  });
});

describe('wallTimeIn / dateIn', () => {
  it('shows a moment on each city’s clock', () => {
    const at = new Date('2026-10-09T08:00:00.000Z');
    expect(wallTimeIn(at, SYD)).toBe('2026-10-09T19:00');
    expect(wallTimeIn(at, PER)).toBe('2026-10-09T16:00');
    expect(wallTimeIn(at.toISOString(), BNE)).toBe('2026-10-09T18:00');
  });

  it('gives the city’s calendar day, which can differ from Sydney’s', () => {
    // 10:30 pm in Perth is already tomorrow in Sydney.
    const at = instantFromWallTime('2026-11-13T22:30', PER);
    expect(dateIn(at, PER)).toBe('2026-11-13');
    expect(dateIn(at, SYD)).toBe('2026-11-14');
  });

  it('is empty for an invalid date rather than throwing', () => {
    expect(wallTimeIn('not a date', SYD)).toBe('');
    expect(dateIn(new Date(NaN), SYD)).toBe('');
  });

  it('round-trips every half hour of a whole year, in every kind of zone', () => {
    // Every wall time that exists comes back exactly; only the skipped hour
    // on the morning clocks go forward (moved on by an hour) differs.
    for (const tz of [SYD, BNE, ADL, PER, 'Australia/Hobart', 'Australia/Darwin']) {
      let skipped = 0;
      for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 30 * 60 * 1000) {
        const wall = wallTimeIn(new Date(t), tz);
        const back = instantFromWallTime(wall, tz);
        // A time that happens twice comes back as the first of the two.
        if (back.getTime() !== t) {
          expect(wallTimeIn(back, tz), `${tz} ${wall}`).toBe(wall);
          expect(back.getTime()).toBeLessThan(t);
          skipped++;
        }
      }
      // Only the repeated hour when clocks go back (two half-hours) differs.
      expect(skipped, tz).toBe(tz === BNE || tz === PER || tz === 'Australia/Darwin' ? 0 : 2);
    }
  });
});

describe('startOfDayIn / endOfDayIn', () => {
  it('spans a normal Sydney day exactly', () => {
    expect(iso(startOfDayIn('2026-07-10', SYD))).toBe('2026-07-09T14:00:00.000Z');
    expect(iso(endOfDayIn('2026-07-10', SYD))).toBe('2026-07-10T13:59:59.999Z');
  });

  it('is 23 hours long the day clocks go forward, and 25 the day they go back', () => {
    const len = (d: string) => endOfDayIn(d, SYD).getTime() + 1 - startOfDayIn(d, SYD).getTime();
    expect(len('2026-10-04')).toBe(23 * 3600 * 1000);
    expect(len('2026-04-05')).toBe(25 * 3600 * 1000);
    expect(len('2026-10-05')).toBe(24 * 3600 * 1000);
    // midnight itself is on the old offset the day clocks go forward...
    expect(iso(startOfDayIn('2026-10-04', SYD))).toBe('2026-10-03T14:00:00.000Z');
    // ...and on the new one by the end of it
    expect(iso(endOfDayIn('2026-10-04', SYD))).toBe('2026-10-04T12:59:59.999Z');
  });

  it('has no gap or overlap between consecutive days', () => {
    for (let d = '2026-01-01'; d < '2027-01-01'; d = addDays(d, 1)) {
      expect(endOfDayIn(d, SYD).getTime() + 1, d).toBe(startOfDayIn(addDays(d, 1), SYD).getTime());
    }
  });
});

describe('addDays / addMonths', () => {
  it('steps over month, year and leap-day boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-10-09', 7 * 52)).toBe('2027-10-08');
  });

  it('keeps the day of the month, using the last day of a shorter month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-08-31', 1)).toBe('2026-09-30');
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-10-09', -12 * 18)).toBe('2008-10-09');
  });
});
