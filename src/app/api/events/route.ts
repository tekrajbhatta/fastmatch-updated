import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandling } from '@/lib/withErrorHandling';

// GET /api/events?cityId=&themeId= — public browse list: upcoming, public
// events only, with a live booked-count per gender for the "spots left" bar.
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
      theme: true,
      city: true,
      _count: { select: { bookings: true } },
    },
    orderBy: { startsAt: 'asc' },
  });

  // Split booked counts by gender for the spots-left bar
  const withCounts = await Promise.all(
    events.map(async (e) => {
      const [men, women] = await Promise.all([
        prisma.booking.count({ where: { eventId: e.id, status: { in: ['PENDING', 'CONFIRMED'] }, member: { gender: 'MALE' } } }),
        prisma.booking.count({ where: { eventId: e.id, status: { in: ['PENDING', 'CONFIRMED'] }, member: { gender: 'FEMALE' } } }),
      ]);
      return { ...e, menBooked: men, womenBooked: women };
    })
  );

  return NextResponse.json(withCounts);
});
