'use client';

import { eventClock } from '@/lib/timezone';

/**
 * "4 Oct, 7:00 pm": an event's date and time on its own city's clock, as it's
 * advertised to members, with "Perth time" underneath when the viewer's own
 * clock reads differently. For admin tables.
 */
export default function EventWhen({ startsAt, city, weekday = false }: { startsAt: string | Date; city: string | undefined; weekday?: boolean }) {
  const c = eventClock(startsAt, city ?? '');
  return (
    <>
      {c.date({ ...(weekday ? { weekday: 'short' } : {}), day: 'numeric', month: 'short' })}, {c.time}
      {c.note && <span className="block text-xs font-normal text-ink/50">{c.note}</span>}
    </>
  );
}
