import type { Event } from '@prisma/client';

/**
 * Whether an event can be booked, and if not, why — the booking checks and
 * the event page use the same answer. The booking checks never used to look
 * at the date, so members could pay for an event that had already happened.
 *
 *   open       — can be booked
 *   finished   — it has started (or is over)
 *   cancelled  — the admin cancelled it
 *   not-open   — hidden from the public, an unsaved duplicate, or closed
 *                (its matches already worked out and sent, even if it closed
 *                early or its date was later moved forward)
 *
 * Online booking stays open until the event starts (Gil, 4 Oct: "people can
 * book till start time").
 */
export type EventAvailability = 'open' | 'finished' | 'cancelled' | 'not-open';

/** Minutes before the start that online booking closes: 0, at the start time (Gil). */
export const BOOKING_CUTOFF_MINUTES = 0;

export function eventAvailability(
  e: Pick<Event, 'status' | 'visibility' | 'draft' | 'startsAt' | 'matchesCalculated'>,
  now: Date = new Date(),
): EventAvailability {
  if (e.status === 'CANCELLED') return 'cancelled';
  if (new Date(e.startsAt).getTime() - BOOKING_CUTOFF_MINUTES * 60 * 1000 <= now.getTime()) return 'finished';
  if (e.draft || e.visibility !== 'PUBLIC' || e.status !== 'UPCOMING' || e.matchesCalculated) return 'not-open';
  return 'open';
}

/** What a member is told when they try to book one that isn't open. */
export const NOT_BOOKABLE: Record<Exclude<EventAvailability, 'open'>, string> = {
  finished: 'This event has already started, so it can no longer be booked.',
  cancelled: 'This event was cancelled.',
  'not-open': 'This event is not open for booking.',
};

/**
 * The events anyone may see listed: public, upcoming, not a draft, not
 * started yet, and not closed with its matches already sent (closing early,
 * from an hour before the start, or moving a closed event's date forward
 * used to leave it listed). The Upcoming Events list (/api/events) and the sitemap use
 * this same rule, so the sitemap can never list a hidden event.
 */
export function publicUpcomingWhere(now: Date = new Date()) {
  return { visibility: 'PUBLIC' as const, status: 'UPCOMING' as const, draft: false, matchesCalculated: false, startsAt: { gte: now } };
}
