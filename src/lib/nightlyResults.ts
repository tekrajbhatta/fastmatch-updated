import type { Prisma } from '@prisma/client';
import { EVENT_TIME_ZONE } from './datetime';
import { dateIn, addDays, startOfDayIn } from './zonedTime';
import { endOfEventNight } from './eventNight';

/** How far back the nightly job looks for events whose results never went out. */
export const RESULTS_LOOK_BACK_DAYS = 7;

/**
 * Which events the nightly results job (src/scripts/calculateMatches.ts)
 * picks up: every event that has started, within the last
 * RESULTS_LOOK_BACK_DAYS days (Sydney days), whose matches haven't been calculated
 * (the admin's "Close event now & calculate early" sets that, so those are
 * skipped), leaving out cancelled events and unsaved duplicates.
 *
 * The job runs at midnight. It used to look for events that started between
 * the server's last midnight and now, which at midnight is nothing at all, so
 * the evening's results never went out unless the admin pressed the button.
 * Sydney is worked out explicitly rather than from the server's clock; the
 * look-back also catches an event a missed or failed run left behind,
 * without reaching into years of imported history.
 *
 * And only once the event's choices have closed — midnight on its OWN city's
 * clock (Gil; src/lib/eventNight.ts) — checked with resultsDue below: a Perth
 * event's members can still send choices at Sydney's midnight. (Run hourly,
 * the job picks each event up within the hour after its midnight.)
 */
export function eventsDueForResults(now: Date = new Date()): Prisma.EventWhereInput {
  const today = dateIn(now, EVENT_TIME_ZONE);
  return {
    matchesCalculated: false,
    draft: false,
    status: { not: 'CANCELLED' },
    startsAt: {
      gte: startOfDayIn(addDays(today, -RESULTS_LOOK_BACK_DAYS), EVENT_TIME_ZONE),
      lt: now,
    },
  };
}

/**
 * Events whose results were worked out but didn't all go out (Mailgun down
 * at midnight, say, or the job stopped between working them out and
 * emailing): the job tries the rest again each run, within the same
 * look-back. Nobody already emailed is emailed twice (sendMatchEmails).
 */
export function eventsWithResultsToResend(now: Date = new Date()): Prisma.EventWhereInput {
  const today = dateIn(now, EVENT_TIME_ZONE);
  return {
    matchesCalculated: true,
    matchEmailsSent: false,
    draft: false,
    status: { not: 'CANCELLED' },
    startsAt: {
      gte: startOfDayIn(addDays(today, -RESULTS_LOOK_BACK_DAYS), EVENT_TIME_ZONE),
      lt: now,
    },
  };
}

/** Have the event's choices closed (its city's midnight has passed)? */
export function resultsDue(event: { startsAt: Date; city: { name: string } | null }, now: Date = new Date()): boolean {
  return endOfEventNight(event) <= now;
}
