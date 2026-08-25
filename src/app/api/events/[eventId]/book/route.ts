import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { getStripe } from '@/lib/stripe';
import { getSessionMember } from '@/lib/auth';
import { calculateAge } from '@/lib/age';
import { sendBookingConfirmation } from '@/lib/sendBookingConfirmation';
import { withErrorHandling } from '@/lib/withErrorHandling';

const bodySchema = z.object({ discountCode: z.string().optional() });

// POST /api/events/:eventId/book
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

  const event = await prisma.event.findUniqueOrThrow({ where: { id: params.eventId } });
  if (event.visibility !== 'PUBLIC' || event.status !== 'UPCOMING') {
    return NextResponse.json({ error: 'This event is not open for booking.' }, { status: 400 });
  }

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

  const existing = await prisma.booking.findUnique({
    where: { eventId_memberId: { eventId: params.eventId, memberId: member.id } },
  });
  if (existing) {
    return NextResponse.json({ error: 'You already have a booking for this event.' }, { status: 409 });
  }

  // Capacity check — "first come, first served", per the Terms & Conditions
  const bookedCount = await prisma.booking.count({
    where: { eventId: params.eventId, status: { in: ['PENDING', 'CONFIRMED'] }, member: { gender: member.gender } },
  });
  const capacity = member.gender === 'MALE' ? event.maxMen : event.maxWomen;
  if (bookedCount >= capacity) {
    return NextResponse.json({ error: 'This event is full for your gender.' }, { status: 409 });
  }

  const { discountCode } = bodySchema.parse(await req.json().catch(() => ({})));
  let finalAmount = Number(event.cost);
  let discount = null;

  if (discountCode) {
    discount = await prisma.discountCode.findUnique({ where: { code: discountCode } });
    const now = new Date();
    const valid =
      discount &&
      discount.validFrom <= now &&
      discount.validTo >= now &&
      (!discount.scopeThemeId || discount.scopeThemeId === event.themeId);

    if (!valid) {
      return NextResponse.json({ error: 'This discount code is not valid for this event.' }, { status: 400 });
    }

    if (discount!.type === 'PERCENT_OFF') finalAmount *= 1 - Number(discount!.amount) / 100;
    if (discount!.type === 'FIXED_REDUCTION') finalAmount = Math.max(0, finalAmount - Number(discount!.amount));
    if (discount!.type === 'FREE') finalAmount = 0;
  }

  // Badge = next sequential number for this event, across both genders,
  // in booking order (matches the old system's model exactly)
  const highestBadge = await prisma.booking.aggregate({
    where: { eventId: params.eventId },
    _max: { badge: true },
  });
  const badge = (highestBadge._max.badge ?? 0) + 1;

  const booking = await prisma.booking.create({
    data: {
      eventId: params.eventId,
      memberId: member.id,
      badge,
      paidAmount: finalAmount,
      status: 'PENDING',
      discountCodeId: discount?.id,
    },
  });

  // Free events skip Stripe entirely and confirm immediately
  if (finalAmount === 0) {
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED' } });
    if (discount) await prisma.discountCode.update({ where: { id: discount.id }, data: { usedCount: { increment: 1 } } });
    await sendBookingConfirmation(booking.id);
    return NextResponse.json({ booking, checkoutUrl: null });
  }

  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'aud',
          product_data: { name: event.name },
          unit_amount: Math.round(finalAmount * 100),
        },
        quantity: 1,
      },
    ],
    metadata: { bookingId: booking.id },
    success_url: `${process.env.APP_URL}/events/${event.id}/booked?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL}/events/${event.id}`,
  });

  await prisma.booking.update({ where: { id: booking.id }, data: { stripePaymentIntentId: session.id } });

  return NextResponse.json({ booking, checkoutUrl: session.url });
});
