import { Prisma } from '@prisma/client';
import type { Booking } from '@prisma/client';
import { prisma } from './prisma';
import { getStripe } from './stripe';
import { placesTaken, countHeld, capacityProblem, holdCutoff } from './capacity';

/**
 * Gil's rule: a booking isn't a booking until it's paid. An unpaid (PENDING)
 * one only holds places for the first 10 minutes of its payment page
 * (src/lib/capacity.ts) and must never stop anyone booking.
 *
 * But one member per event is a database constraint, so an old unpaid
 * booking still occupies that member's row. Whenever a new booking needs the
 * row (the member tries again, an admin adds them, a friend brings them),
 * this clears the old one out of the way.
 *
 * It first closes the old Stripe checkout if it's still open, so that
 * abandoned payment page can't be paid later for a booking that no longer
 * exists. If that checkout has in fact just been PAID, nothing is released:
 * returns 'paid' and the Stripe webhook will confirm it.
 */
export async function releasePendingBooking(
  booking: Pick<Booking, 'id' | 'status' | 'stripePaymentIntentId'>,
): Promise<'released' | 'paid' | 'not-pending'> {
  if (booking.status !== 'PENDING') return 'not-pending';
  if ((await closeCheckout(booking)) === 'paid') return 'paid';
  await dropUnpaidBooking(booking.id);
  return 'released';
}

/** What a reopened booking was before (see createMemberBooking). */
export interface ReopenedFrom {
  status: 'CANCELLED' | 'REFUNDED';
  paidAmount: string;
  paymentMethod: Booking['paymentMethod'];
  discountCodeId: string | null;
  bookedById: string | null;
  stripePaymentIntentId: string | null;
  checkedIn: boolean;
  checkedInAt: string | null;
  reminderSent: boolean;
  confirmedAt: string | null;
  createdAt: string;
}

/**
 * An unpaid booking that's going nowhere — its payment page expired or the
 * payment failed, the page couldn't be opened, or a new attempt replaces it.
 * A cancelled or refunded booking the member had reopened by booking again
 * goes back to exactly what it was (its refund record, badge and friends'
 * link kept); any other is removed. Only while it's still unpaid, and given a
 * Stripe session, only while it's still that session's.
 */
export async function dropUnpaidBooking(bookingId: string, sessionId?: string): Promise<void> {
  const where: Prisma.BookingWhereInput = { id: bookingId, status: 'PENDING', ...(sessionId ? { stripePaymentIntentId: sessionId } : {}) };
  const b = await prisma.booking.findFirst({ where });
  if (!b) return;
  const was = b.reopenedFrom && typeof b.reopenedFrom === 'object' && !Array.isArray(b.reopenedFrom)
    ? (b.reopenedFrom as unknown as ReopenedFrom)
    : null;
  if (!was) {
    await prisma.booking.deleteMany({ where });
    return;
  }
  await prisma.booking.updateMany({
    where,
    data: {
      status: was.status,
      paidAmount: was.paidAmount,
      paymentMethod: was.paymentMethod,
      discountCodeId: was.discountCodeId,
      bookedById: was.bookedById,
      stripePaymentIntentId: was.stripePaymentIntentId,
      checkedIn: was.checkedIn,
      checkedInAt: was.checkedInAt ? new Date(was.checkedInAt) : null,
      reminderSent: was.reminderSent,
      confirmedAt: was.confirmedAt ? new Date(was.confirmedAt) : null,
      createdAt: new Date(was.createdAt),
      pendingFriends: Prisma.DbNull,
      reopenedFrom: Prisma.DbNull,
    },
  });
}

/**
 * Closes an unpaid booking's Stripe payment page, if it's still open, so it
 * can't be paid from now on. Returns 'paid' if it already has been (Stripe's
 * webhook will confirm the booking), otherwise 'closed'.
 */
export async function closeCheckout(booking: Pick<Booking, 'stripePaymentIntentId'>): Promise<'paid' | 'closed'> {
  // Holds the Checkout Session id (see /api/events/:id/book), despite the name.
  const sessionId = booking.stripePaymentIntentId;
  if (!sessionId) return 'closed';
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.status === 'complete') return 'paid';
  if (session.status === 'open') {
    try {
      await stripe.checkout.sessions.expire(sessionId);
    } catch (err) {
      // Paid in the moment between checking and expiring.
      const again = await stripe.checkout.sessions.retrieve(sessionId);
      if (again.status === 'complete') return 'paid';
      throw err;
    }
  }
  return 'closed';
}

/**
 * Someone has just taken places (booked, been added by the admin, or paid
 * after their hold ran out). Unpaid bookings whose 10-minute hold has run
 * out, and whose people no longer fit, have their payment pages closed: they
 * mustn't be paid for places that have gone (Gil, Q1). One that still fits
 * stays open, and the first to pay gets the place. One being paid this very
 * moment is refunded if it no longer fits (confirmBookingGroup, the webhook).
 * Never throws: the booking that called it has already gone through.
 */
export async function closeLapsedCheckouts(eventId: string): Promise<void> {
  try {
    const lapsed = await prisma.booking.findMany({
      where: { eventId, status: 'PENDING', createdAt: { lt: holdCutoff() }, stripePaymentIntentId: { not: null } },
      include: { member: { select: { gender: true } } },
    });
    if (lapsed.length === 0) return;
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { maxMen: true, maxWomen: true } });
    if (!event) return;
    const taken = await placesTaken(eventId);
    for (const b of lapsed) {
      if (!capacityProblem(taken, event, countHeld([b]))) continue;
      if ((await closeCheckout(b)) === 'closed') await dropUnpaidBooking(b.id, b.stripePaymentIntentId ?? undefined);
    }
  } catch (err) {
    console.error(`Event ${eventId}: couldn't close the payment pages whose hold ran out`, err);
  }
}
