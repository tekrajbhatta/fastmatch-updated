import { prisma } from './prisma';

/** What the admin's event screens need with each event. */
export const ADMIN_EVENT_INCLUDE = { theme: true, city: true, venue: true, _count: { select: { bookings: true } } } as const;

/**
 * Paid places taken at each event, by gender ("12 men · 9 women"), counted in
 * one query for all of them. It used to be two counts per event, every time
 * an admin event screen opened: about two thousand queries with a thousand
 * events.
 */
export async function placesByEvent(eventIds?: string[]): Promise<Map<string, { men: number; women: number }>> {
  const rows = await prisma.$queryRaw<{ eventId: string; gender: string; n: bigint | number }[]>`
    SELECT b.eventId AS eventId, m.gender AS gender, COUNT(*) AS n
    FROM \`Booking\` b JOIN \`Member\` m ON m.id = b.memberId
    WHERE b.status = 'CONFIRMED'
    GROUP BY b.eventId, m.gender`;
  const wanted = eventIds ? new Set(eventIds) : null;
  const byEvent = new Map<string, { men: number; women: number }>();
  for (const r of rows) {
    if (wanted && !wanted.has(r.eventId)) continue;
    const entry = byEvent.get(r.eventId) ?? { men: 0, women: 0 };
    if (r.gender === 'MALE') entry.men = Number(r.n);
    else if (r.gender === 'FEMALE') entry.women = Number(r.n);
    byEvent.set(r.eventId, entry);
  }
  return byEvent;
}

/** One event for the admin's screens, with its paid places by gender; null if there's no such event. */
export async function adminEvent(id: string) {
  const event = await prisma.event.findUnique({ where: { id }, include: ADMIN_EVENT_INCLUDE });
  if (!event) return null;
  const [menBooked, womenBooked] = await Promise.all([
    prisma.booking.count({ where: { eventId: id, status: 'CONFIRMED', member: { gender: 'MALE' } } }),
    prisma.booking.count({ where: { eventId: id, status: 'CONFIRMED', member: { gender: 'FEMALE' } } }),
  ]);
  return { ...event, menBooked, womenBooked };
}
