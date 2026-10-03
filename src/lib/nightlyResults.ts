import type { Prisma } from '@prisma/client';
import { EVENT_TIME_ZONE } from './datetime';
import { dateIn, addDays, startOfDayIn } from './zonedTime';

/** How far back the nightly job looks for events whose results never went out. */
export const RESULTS_LOOK_BACK_DAYS = 7;

/**
 * Which events the nightly results job (src/scripts/calculateMatches.ts)
 * picks up: every event that started before today began in Sydney, within
 * the last RESULTS_LOOK_BACK_DAYS days, whose matches haven't been calculated
 * (the admin's "Close event now & calculate early" sets that, so those are
 * skipped), leaving out cancelled events and unsaved duplicates.
 *
 * The job runs at midnight. It used to look for events that started between
 * the server's last midnight and now, which at midnight is nothing at all, so
 * the evening's results never went out unless the admin pressed the button.
 * Sydney is worked out explicitly rather than from the server's clock; the
 * look-back also catches an event a missed or failed run left behind,
 * without reaching into years of imported history.
 */
export function eventsDueForResults(now: Date = new Date()): Prisma.EventWhereInput {
  const today = dateIn(now, EVENT_TIME_ZONE);
  return {
    matchesCalculated: false,
    draft: false,
    status: { not: 'CANCELLED' },
    startsAt: {
      gte: startOfDayIn(addDays(today, -RESULTS_LOOK_BACK_DAYS), EVENT_TIME_ZONE),
      lt: startOfDayIn(today, EVENT_TIME_ZONE),
    },
  };
}
