import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// GET /api/events?cityId=&themeId= — public browse list: upcoming, public
// events only, with a live booked-count per gender for the "spots left" bar.
//
// Stays PUBLIC — logged-out visitors browse the same list. When there IS a
// session, each event also reports `bookedByMe`, which the events page uses
// to separate "events you have booked into" from the rest. Any booking row
// counts, matching how the event detail page computes `alreadyBooked`.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const cityId = params.get('cityId') ?? undefined;
  const themeId = params.get('themeId') ?? undefined;

  const events = await prisma.event.findMany({
    where: {
      visibility: 'PUBLIC',
      status: 'UPCOMING',
      startsAt: { gte: new Date() },
      ...(cityId ? { cityId } : {}),
      ...(themeId ? { themeId } : {}),
    },
    include: {
      venue: true,
      theme: true,
      city: true,
      _count: { select: { bookings: true } },
    },
    orderBy: { startsAt: 'asc' },
  });

  // Which of these the viewer has booked — one query for the whole list
  // rather than one per event.
  const member = await getSessionMember(req);
  const bookedIds = member
    ? new Set(
        (
          await prisma.booking.findMany({
            where: { memberId: member.id, eventId: { in: events.map((e) => e.id) } },
            select: { eventId: true },
          })
        ).map((b) => b.eventId)
      )
    : new Set<string>();

  // Split booked counts by gender for the spots-left bar
  const withCounts = await Promise.all(
    events.map(async (e) => {
      const [men, women] = await Promise.all([
        prisma.booking.count({ where: { eventId: e.id, status: { in: ['PENDING', 'CONFIRMED'] }, member: { gender: 'MALE' } } }),
        prisma.booking.count({ where: { eventId: e.id, status: { in: ['PENDING', 'CONFIRMED'] }, member: { gender: 'FEMALE' } } }),
      ]);
      return { ...e, menBooked: men, womenBooked: women, bookedByMe: bookedIds.has(e.id) };
    })
  );

  return NextResponse.json(withCounts);
});
