import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { getSessionMember } from '@/lib/auth';

// GET /api/events/:eventId — single event detail page. If the requester is
// logged in, also reports whether they already have a booking for it.
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ eventId: string }> }) => {
  const params = await ctx.params;
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: params.eventId },
    include: { theme: true, city: true },
  });

  const [menBooked, womenBooked] = await Promise.all([
    prisma.booking.count({ where: { eventId: event.id, status: { in: ['PENDING', 'CONFIRMED'] }, member: { gender: 'MALE' } } }),
    prisma.booking.count({ where: { eventId: event.id, status: { in: ['PENDING', 'CONFIRMED'] }, member: { gender: 'FEMALE' } } }),
  ]);

  const member = await getSessionMember(req);
  let alreadyBooked = false;
  if (member) {
    const existing = await prisma.booking.findUnique({
      where: { eventId_memberId: { eventId: event.id, memberId: member.id } },
    });
    alreadyBooked = !!existing;
  }

  return NextResponse.json({ ...event, menBooked, womenBooked, alreadyBooked });
});
