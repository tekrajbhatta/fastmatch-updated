import type { Booking } from '@prisma/client';
import { prisma } from './prisma';
import { getStripe } from './stripe';

/**
 * Gil's rule: a booking isn't a booking until it's paid. An unpaid (PENDING)
 * one holds no places — see the capacity counts, which include CONFIRMED only
 * — and must never stop anyone booking.
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

  // Holds the Checkout Session id (see /api/events/:id/book), despite the name.
  const sessionId = booking.stripePaymentIntentId;
  if (sessionId) {
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
  }

  await prisma.booking.deleteMany({ where: { id: booking.id, status: 'PENDING' } });
  return 'released';
}
