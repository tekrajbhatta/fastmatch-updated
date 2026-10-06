import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getStripe, getStripeWebhookSecret, isOurCheckoutSession } from '@/lib/stripe';
import { dropUnpaidBooking } from '@/lib/pendingBooking';
import { confirmBookingGroup } from '@/lib/memberBooking';
import { alertRefundNeeded } from '@/lib/paymentAlerts';
import { refundPaymentForCancelledEvent } from '@/lib/cancelEvent';
import { refundPaymentForFullEvent } from '@/lib/fullEventRefund';
import { checkoutRefunded } from '@/lib/refunds';
import { eventLabel } from '@/lib/eventLabel';
import { withErrorHandling } from '@/lib/withErrorHandling';

// Per the Terms & Conditions: "Your credit card will not be debited until
// your place at one of our events is confirmed." Booking status only flips
// to CONFIRMED here, once Stripe confirms the charge actually succeeded —
// never optimistically on the client side.
//
// The Stripe webhook endpoint must send these events:
//   checkout.session.completed                — paid (or, for slower payment
//                                               methods, submitted but not yet paid)
//   checkout.session.async_payment_succeeded  — a slower payment has now cleared
//   checkout.session.async_payment_failed     — it didn't
//   checkout.session.expired                  — the 30-minute payment page closed unpaid
export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature') as string;

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, getStripeWebhookSecret());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
  }

  if (!event.type.startsWith('checkout.session.')) return NextResponse.json({ received: true });
  const session = event.data.object as Stripe.Checkout.Session;
  const bookingId = session.metadata?.bookingId;
  // Another site's payment on the same Stripe account: not ours to act on.
  if (!bookingId || !isOurCheckoutSession(session)) return NextResponse.json({ received: true });

  switch (event.type) {
    case 'checkout.session.completed':
      // "Completed" can also mean a slower payment was only submitted; then
      // the booking waits for async_payment_succeeded.
      if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
        await confirmPaid(bookingId, session);
      }
      break;
    case 'checkout.session.async_payment_succeeded':
      await confirmPaid(bookingId, session);
      break;
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired':
      // Not paid: the unpaid booking stops holding its places and goes (or,
      // if it was a cancelled booking reopened, goes back to that). Only if
      // it's still this checkout's — the member may have started another.
      await dropUnpaidBooking(bookingId, session.id);
      break;
  }

  return NextResponse.json({ received: true });
});

/**
 * Confirms the member AND any friends they paid for, counts the discount code
 * once, and emails everyone. Idempotent, so Stripe's retries can't
 * double-count a code or re-send confirmations.
 *
 * If the booking didn't need this payment — the admin had already marked it
 * paid by hand, or it was cancelled — the money is flagged for a refund. A
 * payment for an event that has been cancelled is refunded automatically
 * (Gil: everyone is refunded when an event is cancelled), and so is one that
 * came through after its 10-minute hold ran out, once the event was full
 * (Gil, Q1: no bookings taken if the event is full).
 */
async function confirmPaid(bookingId: string, session: Stripe.Checkout.Session) {
  // Only the payment page the booking is waiting on confirms it.
  const result = await confirmBookingGroup(bookingId, { sessionId: session.id });
  if (result.confirmed) return;

  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { member: true, event: { include: { theme: true } } } });
  const amount = session.amount_total != null ? session.amount_total / 100 : null;
  // A retry of a payment that already confirmed this booking is fine.
  if (b?.status === 'CONFIRMED' && !b.paymentMethod && b.stripePaymentIntentId === session.id) return;
  if (b?.event.status === 'CANCELLED' && b.stripePaymentIntentId === session.id) {
    await refundPaymentForCancelledEvent(b.id, session.id);
    return;
  }
  if (b && b.stripePaymentIntentId === session.id) {
    if (result.full) {
      await refundPaymentForFullEvent(b.id, session.id, amount);
      return;
    }
    // Stripe telling us again about a payment refunded already (for a full
    // event, say): nothing left to do.
    if (b.status === 'REFUNDED' && (await checkoutRefunded(session.id))) return;
  }
  const reason = !b
    ? 'the booking no longer exists'
    : b.status === 'CONFIRMED'
      ? 'the booking had already been marked paid by hand'
      : b.status === 'PENDING'
        ? 'the payment was for an earlier payment page of this booking'
        : `the booking is ${b.status.toLowerCase()}`;
  await alertRefundNeeded({ sessionId: session.id, bookingId, memberName: b?.member.name, eventName: b ? eventLabel(b.event) : null, amount, reason });
}
