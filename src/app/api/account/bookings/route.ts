import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { checkInState, checkInWindow } from '@/lib/eventNight';

const DAY = 24 * 60 * 60 * 1000;

// GET /api/account/bookings — the signed-in member's events still to come,
// for "Events you are currently booked into", each with where check-in
// stands. An event stays here until midnight on its night, when check-in
// closes (src/lib/eventNight.ts): the public events list drops it as soon as
// it starts, which is just when members arrive to check in.
//
// Paid bookings only, for events that aren't drafts or cancelled. An event
// the admin has hidden from the public is still listed: the member is still
// going (Gil: hiding does nothing to bookings).
export const GET = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const now = new Date();
  const bookings = await prisma.booking.findMany({
    where: {
      memberId: member.id,
      status: 'CONFIRMED',
      // The night is over by the next midnight; two days back covers every time zone.
      event: { draft: false, status: { not: 'CANCELLED' }, startsAt: { gte: new Date(now.getTime() - 2 * DAY) } },
    },
    include: { event: { include: { venue: true, theme: true, city: true } } },
    orderBy: { event: { startsAt: 'asc' } },
  });

  return NextResponse.json(
    bookings
      .filter((b) => checkInState(b.event, now) !== 'closed')
      .map((b) => ({
        id: b.event.id,
        name: b.event.name,
        startsAt: b.event.startsAt,
        ageMin: b.event.ageMin,
        ageMax: b.event.ageMax,
        theme: { name: b.event.theme.name },
        city: { name: b.event.city.name },
        venue: { name: b.event.venue.name, address: b.event.venue.address },
        checkedIn: b.checkedIn,
        checkIn: checkInState(b.event, now),
        checkInOpensAt: checkInWindow(b.event).opens,
      })),
  );
});
