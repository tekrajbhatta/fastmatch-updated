import { describe, it, expect } from 'vitest';
import { eventsDueForResults, RESULTS_LOOK_BACK_DAYS } from '@/lib/nightlyResults';

/**
 * The nightly results job runs at midnight. Before this, it only looked for
 * events that started between the server's last midnight and "now" — which,
 * at midnight, is nothing — so the evening's results never went out.
 */
const range = (now: string) => eventsDueForResults(new Date(now)).startsAt as { gte: Date; lt: Date };

describe('eventsDueForResults', () => {
  it('at midnight, picks up the evening just gone', () => {
    // The cron fires at 00:00 on Saturday 10 October, Sydney time (UTC+11).
    const r = range('2026-10-09T13:00:05Z');
    expect(r.lt.toISOString()).toBe('2026-10-09T13:00:00.000Z'); // midnight just gone, Sydney
    const fridayEvening = new Date('2026-10-09T08:00:00Z'); // 7 pm Friday in Sydney
    expect(fridayEvening >= r.gte && fridayEvening < r.lt).toBe(true);
  });

  it('leaves events that haven’t happened yet today alone', () => {
    const r = range('2026-10-09T13:00:05Z');
    const saturdayEvening = new Date('2026-10-10T08:00:00Z');
    expect(saturdayEvening < r.lt).toBe(false);
  });

  it('looks back a week for events a missed run left behind, and no further', () => {
    const r = range('2026-10-09T13:00:05Z');
    expect(r.gte.toISOString()).toBe('2026-10-02T14:00:00.000Z'); // midnight 3 October, Sydney (UTC+10)
    expect((r.lt.getTime() - r.gte.getTime()) / 3600_000).toBe(RESULTS_LOOK_BACK_DAYS * 24 - 1); // the clocks went forward in between
  });

  it('works Sydney days out from the date, not the server’s clock', () => {
    // 11:30 pm Friday in Sydney is still Friday morning in UTC; "today" is Friday.
    expect(range('2026-10-09T12:30:00Z').lt.toISOString()).toBe('2026-10-08T13:00:00.000Z');
  });

  it('skips calculated, cancelled and draft events', () => {
    const where = eventsDueForResults(new Date('2026-10-09T13:00:05Z'));
    expect(where.matchesCalculated).toBe(false);
    expect(where.draft).toBe(false);
    expect(where.status).toEqual({ not: 'CANCELLED' });
  });
});
