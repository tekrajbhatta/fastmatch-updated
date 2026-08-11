import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { sendBookingConfirmation } from '@/lib/sendBookingConfirmation';
import { withErrorHandling } from '@/lib/withErrorHandling';

// NOTE ON THE SLUG NAME: this lives under [id], not [eventId] as in the client
// delivery. Next.js rejects two different slug names at the same path level,
// and this folder's siblings ([id]/route.ts, [id]/close/route.ts) already use
// [id]. The URL is unchanged — /api/admin/events/<eventId>/bookings still
// resolves here, so the admin screens need no adjustment.

const bodySchema = z.object({
  memberId: z.string(),
  markAsPaidCash: z.boolean().default(true),
});

// GET /api/admin/events/:id/bookings — the attendee list on the admin
// Event Bookings screen (badge, name, email/mobile, paid status).
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const bookings = await prisma.booking.findMany({
    where: { eventId: params.id },
    include: { member: true },
    orderBy: { badge: 'asc' },
  });

  return NextResponse.json(bookings);
});

// POST /api/admin/events/:id/bookings — "Add booking" on the walk-in
// flow. Distinct from the member self-service /book route: no Stripe (cash
// at the door instead), no email/mobile/T&Cs verification gate (the host is
// standing there with them), and auto-checked-in immediately since they've
// physically arrived — they shouldn't have to separately scan the venue QR
// right after the host just booked them in.
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'A member must be selected.' }, { status: 400 });

  const event = await prisma.event.findUniqueOrThrow({ where: { id: params.id } });
  const member = await prisma.member.findUniqueOrThrow({ where: { id: parsed.data.memberId } });

  const existing = await prisma.booking.findUnique({
    where: { eventId_memberId: { eventId: params.id, memberId: member.id } },
  });
  if (existing) {
    return NextResponse.json({ error: `${member.name} already has a booking for this event.` }, { status: 409 });
  }

  const bookedCount = await prisma.booking.count({
    where: { eventId: params.id, status: { in: ['PENDING', 'CONFIRMED'] }, member: { gender: member.gender } },
  });
  const capacity = member.gender === 'MALE' ? event.maxMen : event.maxWomen;
  if (bookedCount >= capacity) {
    return NextResponse.json({ error: 'This event is full for that gender.' }, { status: 409 });
  }

  const highestBadge = await prisma.booking.aggregate({ where: { eventId: params.id }, _max: { badge: true } });
  const badge = (highestBadge._max.badge ?? 0) + 1;

  const booking = await prisma.booking.create({
    data: {
      eventId: params.id,
      memberId: member.id,
      badge,
      paidAmount: parsed.data.markAsPaidCash ? event.cost : 0,
      status: parsed.data.markAsPaidCash ? 'CONFIRMED' : 'PENDING',
      checkedIn: true,
      checkedInAt: new Date(),
    },
  });

  if (booking.status === 'CONFIRMED') {
    await sendBookingConfirmation(booking.id);
  }

  return NextResponse.json(booking);
});
