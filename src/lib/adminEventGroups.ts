/**
 * Colour groups and display order for the admin events list (/admin/events),
 * matching the legend on the old FastMatch admin:
 *
 *   Confirmed event in the next week    yellow   shown first
 *   Unconfirmed event in the next week  orange
 *   Upcoming event                      green
 *   Past event                          white    shown last
 *
 * "The next week" means the next seven days counted from right now — not
 * the next Monday-to-Sunday — which is how the old system behaved: an event
 * two days away on a Sunday is still "next week".
 *
 * `confirmed` is the admin's own checkbox on the edit form. It only changes
 * the colour inside the seven-day window; further out, everything is simply
 * upcoming, and once an event has started it is past.
 */
export type AdminEventGroup = 'confirmedNextWeek' | 'unconfirmedNextWeek' | 'upcoming' | 'past';

export const NEXT_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const GROUP_ORDER: readonly AdminEventGroup[] = ['confirmedNextWeek', 'unconfirmedNextWeek', 'upcoming', 'past'];

export function adminEventGroup(startsAt: Date, confirmed: boolean, now: Date = new Date()): AdminEventGroup {
  const t = startsAt.getTime();
  const n = now.getTime();
  // Already started counts as past, even later the same day.
  if (t < n) return 'past';
  if (t < n + NEXT_WEEK_MS) return confirmed ? 'confirmedNextWeek' : 'unconfirmedNextWeek';
  return 'upcoming';
}

type Sortable = { startsAt: string | Date; confirmed: boolean };

/**
 * Groups in GROUP_ORDER; within a group, soonest first — except past events,
 * which run most recent first so last week's event is at the top of the past
 * section rather than buried behind years of history.
 */
export function sortAdminEvents<T extends Sortable>(events: readonly T[], now: Date = new Date()): T[] {
  const time = (e: T) => new Date(e.startsAt).getTime();
  const group = (e: T) => adminEventGroup(new Date(e.startsAt), e.confirmed, now);
  return [...events].sort((a, b) => {
    const ga = group(a);
    const gb = group(b);
    if (ga !== gb) return GROUP_ORDER.indexOf(ga) - GROUP_ORDER.indexOf(gb);
    const diff = time(a) - time(b);
    return ga === 'past' ? -diff : diff;
  });
}
