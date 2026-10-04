import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { toPublicEvent } from '@/lib/publicEvent';
import { placesTaken } from '@/lib/capacity';

// GET /api/events?cityId=&themeId= — public browse list: upcoming, public
// events only, with a live count of PAID bookings per gender (used for "Sold out").
//
// Stays PUBLIC — logged-out visitors browse the same list. When there IS a
// session, each event also reports `bookedByMe`, which the events page uses
// to separate "events you have booked into" from the rest. Only a paid
// (CONFIRMED) booking counts — an unpaid, cancelled or refunded one isn't a
// booking, and the member can book again — matching how the event detail
// page computes `alreadyBooked`.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const cityId = params.get('cityId') ?? undefined;
  const themeId = params.get('themeId') ?? undefined;

  const events = await prisma.event.findMany({
    where: {
      visibility: 'PUBLIC',
      status: 'UPCOMING',
      draft: false,
      startsAt: { gte: new Date() },
      ...(cityId ? { cityId } : {}),
      ...(themeId ? { themeId } : {}),
    },
    include: { venue: true, theme: true, city: true },
    orderBy: { startsAt: 'asc' },
  });

  // Which of these the viewer has booked — one query for the whole list
  // rather than one per event.
  const member = await getSessionMember(req);
  const bookedIds = member
    ? new Set(
        (
          await prisma.booking.findMany({
            where: { memberId: member.id, eventId: { in: events.map((e) => e.id) }, status: 'CONFIRMED' },
            select: { eventId: true },
          })
        ).map((b) => b.eventId)
      )
    : new Set<string>();

  // Split booked counts by gender for the spots-left bar
  const withCounts = await Promise.all(
    events.map(async (e) => {
      // Paid places and those held by open payment pages, never counting the
      // viewer's own unpaid attempt against them.
      const { men, women } = await placesTaken(e.id, { excludeMemberId: member?.id, excludeEmail: member?.email });
      // Only what the pages show (see toPublicEvent): never the counts,
      // maximums, expenses or the admin's own flags.
      return { ...toPublicEvent(e, { men, women }, member?.gender), bookedByMe: bookedIds.has(e.id) };
    })
  );

  return NextResponse.json(withCounts);
});
