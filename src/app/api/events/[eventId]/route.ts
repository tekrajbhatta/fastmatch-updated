import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { getSessionMember } from '@/lib/auth';
import { toPublicEvent } from '@/lib/publicEvent';

// GET /api/events/:eventId — single event detail page. If the requester is
// logged in, also reports whether they already have a booking for it.
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ eventId: string }> }) => {
  const params = await ctx.params;
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: params.eventId },
    include: { theme: true, city: true, venue: true },
  });

  // A copy made by "Duplicate event" isn't public until the admin saves it.
  const member = await getSessionMember(req);
  if (event.draft && !member?.isAdmin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [menBooked, womenBooked] = await Promise.all([
    prisma.booking.count({ where: { eventId: event.id, status: 'CONFIRMED', member: { gender: 'MALE' } } }),
    prisma.booking.count({ where: { eventId: event.id, status: 'CONFIRMED', member: { gender: 'FEMALE' } } }),
  ]);

  let alreadyBooked = false;
  if (member) {
    const existing = await prisma.booking.findUnique({
      where: { eventId_memberId: { eventId: event.id, memberId: member.id } },
    });
    // An unpaid booking doesn't count — the member can simply book again.
    alreadyBooked = !!existing && existing.status !== 'PENDING';
  }

  // Only what the page shows (see toPublicEvent), for every event a link can
  // reach, hidden, cancelled and past ones included.
  return NextResponse.json({ ...toPublicEvent(event, { men: menBooked, women: womenBooked }), alreadyBooked });
});
