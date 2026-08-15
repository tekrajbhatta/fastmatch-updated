import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type Stripe from 'stripe';
import { getStripe, getStripeWebhookSecret } from '@/lib/stripe';
import { sendBookingConfirmation } from '@/lib/sendBookingConfirmation';
import { withErrorHandling } from '@/lib/withErrorHandling';

// Per the Terms & Conditions: "Your credit card will not be debited until
// your place at one of our events is confirmed." Booking status only flips
// to CONFIRMED here, once Stripe confirms the charge actually succeeded —
// never optimistically on the client side.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature') as string;

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, getStripeWebhookSecret());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const bookingId = session.metadata?.bookingId;
    if (bookingId) {
      const booking = await prisma.booking.update({
        where: { id: bookingId },
        data: { status: 'CONFIRMED' },
      });
      if (booking.discountCodeId) {
        await prisma.discountCode.update({
          where: { id: booking.discountCodeId },
          data: { usedCount: { increment: 1 } },
        });
      }
      // TODO: send confirmation email with check-in QR link
      await sendBookingConfirmation(bookingId);
    }
  }

  return NextResponse.json({ received: true });
});
