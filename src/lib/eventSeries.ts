import { wallTimeIn, instantFromWallTime, addDays, addMonths } from './zonedTime';

export interface RepeatRule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  /** Every N days / weeks / months. */
  interval: number;
  /** "YYYY-MM-DD": the last day an event may fall on (inclusive). */
  endDate: string;
}

/** Guards against a runaway loop from a bad or far-future end date. */
export const SERIES_LIMIT = 200;

/**
 * The start of every event in a repeating series: the first one, then one
 * every N days, weeks or months, up to and including the end date.
 *
 * Steps are taken on the event CITY's clock, so a 7:00 pm event stays at
 * 7:00 pm through the daylight-saving changes (and a Brisbane event, whose
 * clocks never change, isn't moved by Sydney's). A monthly series keeps the
 * same day of the month, or the last day of a shorter month, and counts each
 * month from the first event so it never drifts.
 *
 * The end date is compared as a calendar day in the event's city: an event
 * on the "Ends" date is included.
 */
export function buildOccurrenceDates(first: Date, timeZone: string, repeat?: RepeatRule): Date[] {
  if (!repeat) return [first];

  const wall = wallTimeIn(first, timeZone); // "2026-10-09T19:00"
  const day = wall.slice(0, 10);
  const time = wall.slice(11);
  const step = Math.max(1, Math.floor(repeat.interval));
  const dates: Date[] = [first];

  for (let k = 1; dates.length < SERIES_LIMIT; k++) {
    const next =
      repeat.frequency === 'MONTHLY' ? addMonths(day, k * step)
      : addDays(day, k * step * (repeat.frequency === 'WEEKLY' ? 7 : 1));
    if (next > repeat.endDate) break; // "YYYY-MM-DD" strings sort as dates
    dates.push(instantFromWallTime(`${next}T${time}`, timeZone));
  }
  return dates;
}
