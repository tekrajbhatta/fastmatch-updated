/**
 * Which week an event falls in, for the colour coding on /admin/events.
 *
 * Gil's rule, in his words: past expired events white, events this week
 * yellow, events next week green. Anything further out is left plain — it
 * needs no attention yet, and a fourth colour would only add noise.
 *
 * Weeks run Monday to Sunday, which is how the events themselves are talked
 * about ("the Friday night"), and are measured in the browser's own timezone
 * so the boundaries match the dates shown in the same table.
 */
export type EventPeriod = 'past' | 'thisWeek' | 'nextWeek' | 'later';

/** Midnight on the Monday of the week `date` falls in. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // getDay(): 0 = Sunday. Sunday belongs to the week that started six days
  // earlier, not to the one starting tomorrow.
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function eventPeriod(startsAt: Date, now: Date = new Date()): EventPeriod {
  // An event that has already started is past, even if it is still today —
  // it is no longer something to prepare for.
  if (startsAt.getTime() < now.getTime()) return 'past';

  const thisMonday = startOfWeek(now);
  const nextMonday = addDays(thisMonday, 7);
  const weekAfterNext = addDays(thisMonday, 14);

  if (startsAt < nextMonday) return 'thisWeek';
  if (startsAt < weekAfterNext) return 'nextWeek';
  return 'later';
}
