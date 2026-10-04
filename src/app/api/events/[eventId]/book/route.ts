import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStripe, STRIPE_SITE_TAG } from '@/lib/stripe';
import { getSessionMember } from '@/lib/auth';
import { calculateAge } from '@/lib/age';
import { venueLine } from '@/lib/venue';
import { formatEventWhen } from '@/lib/datetime';
import { eventTimeFor } from '@/lib/timezone';
import {
  bookingBodySchema,
  prepareMemberBooking,
  createMemberBooking,
  discardMemberBooking,
  confirmBookingGroup,
} from '@/lib/memberBooking';
import { releasePendingBooking } from '@/lib/pendingBooking';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { eventAvailability, NOT_BOOKABLE } from '@/lib/eventAvailability';
import { CHECKOUT_MINUTES } from '@/lib/capacity';

// POST /api/events/:eventId/book — a member books themselves, plus any
// friends they're bringing (paying for all of them, less the group discount).
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ eventId: string }> }) => {
  const params = await ctx.params;
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  if (!member.emailVerified || !member.mobileVerified) {
    return NextResponse.json(
      { error: 'Please verify both your email and mobile number before booking an event.' },
      { status: 403 }
    );
  }
  if (!member.agreedTerms) {
    // Covers imported members who were never asked to agree to this site's
    // Terms & Conditions — new registrants already agree at sign-up.
    return NextResponse.json(
      { error: 'Please accept the Terms & Conditions and Privacy Policy before booking an event.' },
      { status: 403 }
    );
  }

  const event = await prisma.event.findUniqueOrThrow({
    where: { id: params.eventId },
    include: { venue: true, city: true },
  });
  // Including once it has started: members could pay for an event that had
  // already happened (src/lib/eventAvailability.ts).
  const availability = eventAvailability(event);
  if (availability !== 'open') return NextResponse.json({ error: NOT_BOOKABLE[availability] }, { status: 400 });

  // Event.ageMin/ageMax existed and were displayed on the event page, but
  // nothing enforced them — a member could book an event outside their age
  // range. Checked here, before the capacity check and before any Stripe
  // checkout session is created, so no payment is ever started for a booking
  // that would be rejected.
  const age = calculateAge(member.dateOfBirth);
  if (age < event.ageMin || age > event.ageMax) {
    return NextResponse.json(
      { error: "Sorry your age is outside of this event's age range" },
      { status: 400 }
    );
  }

  // Only a paid booking counts. One that was never paid is replaced below,
  // once this one has passed its checks; a cancelled or refunded one is
  // reopened (createMemberBooking).
  const existing = await prisma.booking.findUnique({
    where: { eventId_memberId: { eventId: params.eventId, memberId: member.id } },
  });
  if (existing?.status === 'CONFIRMED') {
    return NextResponse.json({ error: 'You already have a booking for this event.' }, { status: 409 });
  }

  const parsed = bookingBodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Please check your booking details.' }, { status: 400 });

  // Discount code, friends, and capacity for everyone. Only PAID places count
  // — per the old site's note, a place isn't reserved until the money is in.
  const prepared = await prepareMemberBooking(member, event, parsed.data);
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.error, fieldErrors: prepared.fieldErrors }, { status: prepared.status });
  }

  if (existing?.status === 'PENDING') {
    // Closes the old payment page too, so it can't be paid afterwards.
    const released = await releasePendingBooking(existing);
    if (released === 'paid') {
      return NextResponse.json(
        { error: 'Your payment for this event has already gone through. Your confirmation email is on its way.' },
        { status: 409 }
      );
    }
  }

  const bookingId = await createMemberBooking(member, event, prepared);

  // Nothing to pay (e.g. a free code, booking alone): confirm straight away.
  if (prepared.quote.total === 0) {
    await confirmBookingGroup(bookingId);
    return NextResponse.json({ bookingId, checkoutUrl: null });
  }

  const friendCount = prepared.friends.length;
  // The event's local time, noted if the member's own clock reads differently.
  const memberCity = await prisma.city.findUnique({ where: { id: member.cityId } });
  const when = eventTimeFor(event.startsAt, event.city.name, memberCity?.name);
  let session;
  try {
    session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'aud',
            // Shown under the product name on Stripe's payment page, so the
            // member sees exactly which event — and for how many people —
            // they're paying before entering card details. (The logo on that
            // page is a Stripe Dashboard branding setting, not set from here.)
            product_data: {
              name: event.name,
              description: [
                friendCount ? `You + ${friendCount} friend${friendCount === 1 ? '' : 's'}` : null,
                venueLine(event.venue),
                event.city.name,
                formatEventWhen(event.startsAt, when.timeZone) + (when.zoneNote ? ` (${when.zoneNote})` : ''),
                `Ages ${event.ageMin}-${event.ageMax}`,
              ].filter(Boolean).join(' · '),
            },
            // One line for the whole booking at the agreed total — the
            // per-person breakdown and discounts are on our page right
            // before this, and Stripe line items can't be negative.
            unit_amount: Math.round(prepared.quote.total * 100),
          },
          quantity: 1,
        },
      ],
      // site: this account may also take payments for other sites (see stripe.ts).
      metadata: { bookingId, site: STRIPE_SITE_TAG },
      // Open for 30 minutes (Stripe's minimum), during which the booking
      // holds its places; when it expires Stripe tells the webhook, which
      // removes the unpaid booking. A few seconds over, so Stripe never
      // refuses it as too short.
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_MINUTES * 60 + 30,
      success_url: `${process.env.APP_URL}/events/${event.id}/booked?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/events/${event.id}`,
    });
  } catch (err) {
    // No payment page, so no booking.
    await discardMemberBooking(bookingId);
    throw err;
  }

  await prisma.booking.update({ where: { id: bookingId }, data: { stripePaymentIntentId: session.id } });

  return NextResponse.json({ bookingId, checkoutUrl: session.url });
});
