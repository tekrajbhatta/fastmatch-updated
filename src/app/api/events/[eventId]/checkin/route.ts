import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// POST /api/events/:eventId/checkin
// Scanning/tapping the event's single shared QR hits this — since the
// attendee is already logged in, no per-person code is needed to know who
// they are. Marks them as checked in, which is what makes them appear on
// the live roster (only checked-in attendees show up, not just bookings).
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ eventId: string }> }) => {
  const params = await ctx.params;
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const booking = await prisma.booking.findUnique({
    where: { eventId_memberId: { eventId: params.eventId, memberId: member.id } },
  });

  if (!booking || booking.status !== 'CONFIRMED') {
    return NextResponse.json({ error: 'No confirmed booking found for this event.' }, { status: 403 });
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { checkedIn: true, checkedInAt: new Date() },
  });

  return NextResponse.json({ badge: updated.badge });
});

// GET /api/events/:eventId/checkin — the live roster: only checked-in attendees.
// Names of the people at an event are private: only someone checked in to
// THIS event (or the admin) may list them, and only confirmed bookings count,
// so a cancelled or refunded booking left ticked doesn't appear.
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ eventId: string }> }) => {
  const params = await ctx.params;
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  if (!member.isAdmin) {
    const own = await prisma.booking.findUnique({
      where: { eventId_memberId: { eventId: params.eventId, memberId: member.id } },
    });
    if (!own || own.status !== 'CONFIRMED' || !own.checkedIn) {
      return NextResponse.json({ error: 'Not checked in to this event' }, { status: 403 });
    }
  }

  const roster = await prisma.booking.findMany({
    where: { eventId: params.eventId, checkedIn: true, status: 'CONFIRMED' },
    include: { member: { select: { id: true, name: true } } },
    orderBy: { badge: 'asc' },
  });

  return NextResponse.json(
    roster.map((b) => ({ badge: b.badge, memberId: b.member.id, name: b.member.name }))
  );
});
