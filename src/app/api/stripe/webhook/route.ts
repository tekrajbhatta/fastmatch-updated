import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';
import { sendBookingConfirmation } from '@/lib/sendBookingConfirmation';
import { withErrorHandling } from '@/lib/withErrorHandling';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET as string;

// Per the Terms & Conditions: "Your credit card will not be debited until
// your place at one of our events is confirmed." Booking status only flips
// to CONFIRMED here, once Stripe confirms the charge actually succeeded —
// never optimistically on the client side.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature') as string;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
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
