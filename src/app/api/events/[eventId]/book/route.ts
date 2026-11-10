import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStripe, STRIPE_SITE_TAG, checkoutPicture } from '@/lib/stripe';
import { eventLabel } from '@/lib/eventLabel';
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
  attachCheckout,
} from '@/lib/memberBooking';
import { releasePendingBooking, closeLapsedCheckouts } from '@/lib/pendingBooking';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { eventAvailability, NOT_BOOKABLE } from '@/lib/eventAvailability';
import { CHECKOUT_MINUTES, holdCutoff } from '@/lib/capacity';
import { hitRateLimit, rateKey, LIMITS } from '@/lib/rateLimit';
import { unfinishedSteps, bookingRefusal } from '@/lib/accountSetup';

/** Two presses of Book at the same moment (two tabs, a double tap): one goes ahead. */
const BOOKED_TWICE = 'Your booking for this event changed while it was being made (it may be open in another tab). Please try again.';

// POST /api/events/:eventId/book — a member books themselves, plus any
// friends they're bringing (paying for all of them, less the group discount).
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ eventId: string }> }) => {
  const params = await ctx.params;
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // Every press of Book counts, before any check: the friend checks say
  // whether an email belongs to a member (and roughly who), and they used to
  // be answerable as often as anyone liked. Thirty an hour is far more than
  // anyone fixing typos needs. (The tighter limit below still counts only
  // the attempts that hold places.)
  const tries = await hitRateLimit(rateKey('book-try', `${member.id}|${params.eventId}`), LIMITS.bookingTries.limit, LIMITS.bookingTries.windowMs);
  if (!tries.allowed) {
    return NextResponse.json(
      { error: 'You’ve tried to book this event many times in the last hour. Please try again later, or contact gil@fastmatch.com.au.' },
      { status: 429 },
    );
  }

  // Email and mobile confirmed, and the Terms accepted (imported members were
  // never asked to agree to this site's; new registrants agree at sign-up).
  // `unfinished` lets the page link to each step.
  const unfinished = unfinishedSteps(member);
  if (unfinished.length > 0) {
    return NextResponse.json({ error: bookingRefusal(unfinished), unfinished }, { status: 403 });
  }

  const event = await prisma.event.findUniqueOrThrow({
    where: { id: params.eventId },
    include: { venue: true, city: true, theme: true },
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

  // A code tried here counts against the same limit as checking one on the
  // event page (/api/events/:id/discount): booking with a guess each time
  // used to try codes without any limit at all.
  if (parsed.data.discountCode?.trim()) {
    const checks = await hitRateLimit(rateKey('discount-check', member.id), LIMITS.discountChecks.limit, LIMITS.discountChecks.windowMs);
    if (!checks.allowed) {
      return NextResponse.json({ error: 'You’ve tried a lot of codes just now. Please wait a few minutes and try again.' }, { status: 429 });
    }
  }

  // Discount code, friends, and capacity for everyone. Only PAID places count
  // — per the old site's note, a place isn't reserved until the money is in.
  const prepared = await prepareMemberBooking(member, event, parsed.data);
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.error, fieldErrors: prepared.fieldErrors }, { status: prepared.status });
  }

  // Each attempt that gets this far holds places: a few an hour is plenty
  // (changing friends, a card that failed), but not booking over and over.
  const attempts = await hitRateLimit(rateKey('book', `${member.id}|${params.eventId}`), LIMITS.bookingAttempts.limit, LIMITS.bookingAttempts.windowMs);
  if (!attempts.allowed) {
    return NextResponse.json(
      { error: 'You’ve tried to book this event many times in the last hour. Please try again later, or contact gil@fastmatch.com.au.' },
      { status: 429 },
    );
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

  // Booking again while the last attempt still holds its places (changing
  // friends, say) carries on that hold rather than starting a new one: the
  // places were already counted from then, and booking over and over could
  // otherwise keep an event looking full indefinitely.
  const holdSince = existing?.status === 'PENDING' && existing.createdAt >= holdCutoff() ? existing.createdAt : undefined;
  const bookingId = await createMemberBooking(member, event, prepared, { holdSince });
  // Another press of Book for this event got there first.
  if (!bookingId) return NextResponse.json({ error: BOOKED_TWICE }, { status: 409 });

  // Nothing to pay (e.g. a free code, booking alone): confirm straight away,
  // as long as the booking is still for nothing (another press may have just
  // put friends on it).
  if (prepared.quote.total === 0) {
    const done = await confirmBookingGroup(bookingId, { expectTotalCents: 0 });
    if (done.amountMismatch) return NextResponse.json({ error: BOOKED_TWICE }, { status: 409 });
    if (done.full) {
      // The last place went to someone else in the moment since the check above.
      await discardMemberBooking(bookingId);
      return NextResponse.json({ error: 'This event is full for your gender.' }, { status: 409 });
    }
    return NextResponse.json({ bookingId, checkoutUrl: null });
  }

  const friendCount = prepared.friends.length;
  // The event's local time, noted if the member's own clock reads differently.
  const memberCity = member.cityId ? await prisma.city.findUnique({ where: { id: member.cityId } }) : null;
  const when = eventTimeFor(event.startsAt, event.city.name, memberCity?.name);
  const picture = checkoutPicture(event, event.venue);
  let session;
  try {
    session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      // Filled in on Stripe's page, so the member doesn't type it (Gil, 8 Oct).
      customer_email: member.email,
      line_items: [
        {
          price_data: {
            currency: 'aud',
            // The event as our emails name it ("Type, Name"), with a picture
            // (Gil, 8 Oct). The description under it says exactly which event,
            // and for how many people, before card details are entered. (The
            // logo and colours on that page are Stripe Dashboard settings.)
            product_data: {
              name: eventLabel(event),
              ...(picture ? { images: [picture] } : {}),
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
      // Open for 30 minutes (Stripe's minimum); the booking holds its places
      // for the first 10 (src/lib/capacity.ts). When it expires Stripe tells
      // the webhook, which removes the unpaid booking. A few seconds over, so
      // Stripe never refuses it as too short.
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_MINUTES * 60 + 30,
      success_url: `${process.env.APP_URL}/events/${event.id}/booked?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/events/${event.id}`,
    });
  } catch (err) {
    // No payment page, so no booking.
    await discardMemberBooking(bookingId);
    throw err;
  }

  // Only if the booking still holds what this page charges for: another press
  // of Book may have changed it while the page was being opened. Then this
  // page is closed, so it can never be paid.
  if (!(await attachCheckout(bookingId, session.id, prepared))) {
    try {
      await getStripe().checkout.sessions.expire(session.id);
    } catch (err) {
      console.error(`Booking ${bookingId}: couldn't close the payment page ${session.id} it no longer matches`, err);
    }
    return NextResponse.json({ error: BOOKED_TWICE }, { status: 409 });
  }
  // These places are held now: older payment pages whose hold ran out, and
  // that no longer fit, are closed (Gil, Q1).
  await closeLapsedCheckouts(event.id);

  return NextResponse.json({ bookingId, checkoutUrl: session.url });
});
