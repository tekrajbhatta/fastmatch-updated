import { describe, it, expect } from 'vitest';
import { buildOccurrenceDates, SERIES_LIMIT } from '@/lib/eventSeries';
import { instantFromWallTime, wallTimeIn } from '@/lib/zonedTime';

const SYD = 'Australia/Sydney';
const BNE = 'Australia/Brisbane';
const walls = (dates: Date[], tz: string) => dates.map((d) => wallTimeIn(d, tz));

describe('buildOccurrenceDates', () => {
  it('is just the one event without a repeat', () => {
    const first = instantFromWallTime('2026-10-09T19:00', SYD);
    expect(buildOccurrenceDates(first, SYD)).toEqual([first]);
  });

  it('includes an event falling on the "Ends" date', () => {
    const first = instantFromWallTime('2026-09-25T19:00', SYD); // a Friday
    const dates = buildOccurrenceDates(first, SYD, { frequency: 'WEEKLY', interval: 1, endDate: '2026-10-30' });
    expect(walls(dates, SYD)).toEqual([
      '2026-09-25T19:00', '2026-10-02T19:00', '2026-10-09T19:00',
      '2026-10-16T19:00', '2026-10-23T19:00', '2026-10-30T19:00', // the end date itself
    ]);
  });

  it('stays at 7 pm on Sydney clocks across the daylight-saving change', () => {
    const first = instantFromWallTime('2026-09-25T19:00', SYD);
    const dates = buildOccurrenceDates(first, SYD, { frequency: 'WEEKLY', interval: 1, endDate: '2026-10-09' });
    // Clocks go forward on 4 October: same wall time, one hour less of UTC.
    expect(dates.map((d) => d.toISOString())).toEqual([
      '2026-09-25T09:00:00.000Z', '2026-10-02T09:00:00.000Z', '2026-10-09T08:00:00.000Z',
    ]);
  });

  it('keeps a Brisbane event at 7 pm Brisbane time, untouched by Sydney’s clock change', () => {
    const first = instantFromWallTime('2026-09-25T19:00', BNE);
    const dates = buildOccurrenceDates(first, BNE, { frequency: 'WEEKLY', interval: 1, endDate: '2026-10-09' });
    expect(dates.map((d) => d.toISOString())).toEqual([
      '2026-09-25T09:00:00.000Z', '2026-10-02T09:00:00.000Z', '2026-10-09T09:00:00.000Z',
    ]);
  });

  it('compares the end date on the event city’s calendar', () => {
    // 10:30 pm in Perth is the next day in Sydney; the Perth date decides.
    const PER = 'Australia/Perth';
    const first = instantFromWallTime('2026-11-06T22:30', PER);
    const dates = buildOccurrenceDates(first, PER, { frequency: 'WEEKLY', interval: 1, endDate: '2026-11-13' });
    expect(walls(dates, PER)).toEqual(['2026-11-06T22:30', '2026-11-13T22:30']);
  });

  it('steps every N days and every N weeks', () => {
    const first = instantFromWallTime('2026-10-01T19:00', SYD);
    expect(walls(buildOccurrenceDates(first, SYD, { frequency: 'DAILY', interval: 2, endDate: '2026-10-07' }), SYD))
      .toEqual(['2026-10-01T19:00', '2026-10-03T19:00', '2026-10-05T19:00', '2026-10-07T19:00']);
    expect(walls(buildOccurrenceDates(first, SYD, { frequency: 'WEEKLY', interval: 2, endDate: '2026-10-31' }), SYD))
      .toEqual(['2026-10-01T19:00', '2026-10-15T19:00', '2026-10-29T19:00']);
  });

  it('keeps the day of the month, using the last day of shorter months, without drifting', () => {
    const first = instantFromWallTime('2026-01-31T19:00', SYD);
    const dates = buildOccurrenceDates(first, SYD, { frequency: 'MONTHLY', interval: 1, endDate: '2026-06-30' });
    expect(walls(dates, SYD)).toEqual([
      '2026-01-31T19:00', '2026-02-28T19:00', '2026-03-31T19:00',
      '2026-04-30T19:00', '2026-05-31T19:00', '2026-06-30T19:00',
    ]);
  });

  it('is only the first event when the end date is before the next one', () => {
    const first = instantFromWallTime('2026-10-09T19:00', SYD);
    expect(buildOccurrenceDates(first, SYD, { frequency: 'WEEKLY', interval: 1, endDate: '2026-10-09' })).toEqual([first]);
    expect(buildOccurrenceDates(first, SYD, { frequency: 'WEEKLY', interval: 1, endDate: '2026-10-01' })).toEqual([first]);
  });

  it(`never makes more than ${SERIES_LIMIT} events`, () => {
    const first = instantFromWallTime('2026-10-09T19:00', SYD);
    expect(buildOccurrenceDates(first, SYD, { frequency: 'DAILY', interval: 1, endDate: '2099-12-31' })).toHaveLength(SERIES_LIMIT);
  });
});
