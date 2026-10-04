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
 *
 * PENDING GIL (question 5): bookings close when the event starts. Whether
 * they should close earlier (say an hour before, or at midnight the day
 * before) is Gil's call; change BOOKING_CUTOFF_MINUTES once he answers.
 */
export type EventAvailability = 'open' | 'finished' | 'cancelled' | 'not-open';

/** Minutes before the start that online booking closes. 0 = at the start time. */
export const BOOKING_CUTOFF_MINUTES = 0;

export function eventAvailability(
  e: Pick<Event, 'status' | 'visibility' | 'draft' | 'startsAt'>,
  now: Date = new Date(),
): EventAvailability {
  if (e.status === 'CANCELLED') return 'cancelled';
  if (new Date(e.startsAt).getTime() - BOOKING_CUTOFF_MINUTES * 60 * 1000 <= now.getTime()) return 'finished';
  if (e.draft || e.visibility !== 'PUBLIC' || e.status !== 'UPCOMING') return 'not-open';
  return 'open';
}

/** What a member is told when they try to book one that isn't open. */
export const NOT_BOOKABLE: Record<Exclude<EventAvailability, 'open'>, string> = {
  finished: 'This event has already started, so it can no longer be booked.',
  cancelled: 'This event was cancelled.',
  'not-open': 'This event is not open for booking.',
};
