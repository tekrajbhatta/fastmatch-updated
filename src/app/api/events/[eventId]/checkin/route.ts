import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { checkInState, checkInWindow } from '@/lib/eventNight';
import { formatEventWhen } from '@/lib/datetime';
import { timeZoneForCity } from '@/lib/timezone';
import { canRate, noMatches, NO_MATCHES_MEMBER_MESSAGE } from '@/lib/ratingAudience';
import { shortName } from '@/lib/personName';

// POST /api/events/:eventId/checkin
// Scanning/tapping the event's single shared QR hits this — since the
// attendee is already logged in, no per-person code is needed to know who
// they are. Marks them as checked in, which is what makes them appear on
// the live roster (only checked-in attendees show up, not just bookings).
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ eventId: string }> }) => {
  const params = await ctx.params;
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // A cancelled event says so, rather than "no confirmed booking" (every
  // booking on it was cancelled with it).
  const cancelled = await prisma.event.findFirst({ where: { id: params.eventId, status: 'CANCELLED' }, select: { id: true } });
  if (cancelled) return NextResponse.json({ error: 'This event was cancelled.', cancelled: true }, { status: 409 });
  // No check-in or matches at this event (a day at the races, say).
  if (await prisma.event.findFirst({ where: { id: params.eventId, ratingAudience: 'NO_MATCHES' }, select: { id: true } })) {
    return NextResponse.json({ error: NO_MATCHES_MEMBER_MESSAGE, noMatches: true }, { status: 409 });
  }

  const booking = await prisma.booking.findUnique({
    where: { eventId_memberId: { eventId: params.eventId, memberId: member.id } },
  });

  if (!booking || booking.status !== 'CONFIRMED') {
    return NextResponse.json({ error: 'No confirmed booking found for this event.' }, { status: 403 });
  }
  // Already in (a reload, or the link opened twice): nothing to change.
  if (booking.checkedIn) return NextResponse.json({ badge: booking.badge });

  // Only on the night (Gil): from an hour before the start until midnight.
  // Members used to be able to check in days early, which put them on
  // everyone's rating list.
  const event = await prisma.event.findUniqueOrThrow({ where: { id: params.eventId }, include: { city: true } });
  const state = checkInState(event);
  if (state !== 'open') {
    const tz = timeZoneForCity(event.city.name);
    return NextResponse.json(
      {
        error: state === 'not-yet'
          ? `Check-in opens an hour before the event starts: ${formatEventWhen(checkInWindow(event).opens, tz)} (${event.city.name} time).`
          : 'Check-in for this event has closed.',
        checkIn: state,
      },
      { status: 403 },
    );
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
//
// A member sees only the people they can rate: on an "Opposite gender only"
// night (the default), men see the women and women the men
// (src/lib/ratingAudience.ts). The admin sees everyone.
//
// And a member sees each of them by first name and last initial ("Anna S.",
// shortName in src/lib/personName.ts): plenty to find the person they just
// met, without the full name of everyone in the room. Their own entry, and
// everything the admin sees, keeps the full name. A mutual match gets the
// full name afterwards, with the contact details, as before.
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

  const [event, roster] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: params.eventId }, select: { ratingAudience: true } }),
    prisma.booking.findMany({
      where: { eventId: params.eventId, checkedIn: true, status: 'CONFIRMED' },
      include: { member: { select: { id: true, name: true, gender: true } } },
      orderBy: { badge: 'asc' },
    }),
  ]);
  const shown = member.isAdmin
    ? roster
    : roster.filter((b) => b.member.id === member.id || canRate(event.ratingAudience, member.gender, b.member.gender));

  return NextResponse.json(
    shown.map((b) => ({
      badge: b.badge,
      memberId: b.member.id,
      name: member.isAdmin || b.member.id === member.id ? b.member.name : shortName(b.member.name),
    }))
  );
});
