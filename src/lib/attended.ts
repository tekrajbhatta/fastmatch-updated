import type { Prisma } from '@prisma/client';

/**
 * A member "attended" an event when they paid for it and it has happened
 * (Gil: "those who paid", no-shows included). Paid means any way: online,
 * cash or card added by the admin, pay at the door, confirmed by the admin,
 * or brought as a friend — i.e. a CONFIRMED booking. A cancelled event
 * didn't happen, so nobody attended it.
 *
 * "Events attended" on the Members list and a member's page used to count
 * every booking, unpaid and future ones included.
 */
export function attendedBookingWhere(now = new Date()): Prisma.BookingWhereInput {
  return { status: 'CONFIRMED', event: { startsAt: { lte: now }, status: { not: 'CANCELLED' } } };
}

/** The same rule for a booking already loaded with its event. */
export function attendedBooking(
  b: { status: string; event: { startsAt: Date | string; status?: string } },
  now = new Date(),
): boolean {
  return b.status === 'CONFIRMED' && b.event.status !== 'CANCELLED' && new Date(b.event.startsAt).getTime() <= now.getTime();
}
