import { timeZoneForCity } from './timezone';
import { dateIn, addDays, startOfDayIn } from './zonedTime';

/*
 * The night of an event, on the event city's clock (Gil, 4 Oct):
 *   - members can check in from an hour before the start until midnight;
 *   - choices (Date / Friend / No) can be sent until that same midnight — "if
 *     they miss midnight deadline for submitting matches, bad luck" — or until
 *     the results are worked out, if the admin does that early.
 * Members could check in on any day before, so "checked in" didn't mean they
 * were there, and choices sent after the results were worked out were saved
 * and silently ignored.
 */

/** Check-in opens this long before the start. */
export const CHECK_IN_OPENS_MINUTES_BEFORE = 60;

interface NightEvent {
  startsAt: Date | string;
  city: { name: string } | null | undefined;
}

/** Midnight at the end of the event's day, in its city: when check-in and choices close. */
export function endOfEventNight(event: NightEvent): Date {
  const tz = timeZoneForCity(event.city?.name);
  return startOfDayIn(addDays(dateIn(event.startsAt, tz), 1), tz);
}

/** When check-in opens and closes. */
export function checkInWindow(event: NightEvent): { opens: Date; closes: Date } {
  const start = new Date(event.startsAt).getTime();
  return { opens: new Date(start - CHECK_IN_OPENS_MINUTES_BEFORE * 60 * 1000), closes: endOfEventNight(event) };
}

export type CheckInState = 'not-yet' | 'open' | 'closed';

export function checkInState(event: NightEvent, now: Date = new Date()): CheckInState {
  const { opens, closes } = checkInWindow(event);
  if (now < opens) return 'not-yet';
  if (now >= closes) return 'closed';
  return 'open';
}

/**
 * Can choices still be sent? Not once the results are worked out (by the
 * midnight job or the admin's "Close event now"), and not after midnight.
 */
export function choicesOpen(event: NightEvent & { matchesCalculated: boolean }, now: Date = new Date()): boolean {
  return !event.matchesCalculated && now < endOfEventNight(event);
}
