import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { checkInState, checkInWindow, choicesOpen } from '@/lib/eventNight';

// GET /api/events/:eventId/night — where the signed-in member stands on the
// night, for the check-in page: whether check-in is open yet (from an hour
// before the start until midnight), their booking and badge, whether choices
// can still be sent, and the choices they've already sent.
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ eventId: string }> }) => {
  const params = await ctx.params;
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const event = await prisma.event.findUnique({ where: { id: params.eventId }, include: { city: true, theme: true } });
  if (!event || event.draft) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const booking = await prisma.booking.findUnique({
    where: { eventId_memberId: { eventId: event.id, memberId: member.id } },
    select: { status: true, checkedIn: true, badge: true },
  });
  const { opens, closes } = checkInWindow(event);
  const checkedIn = booking?.status === 'CONFIRMED' && booking.checkedIn;
  const saved = checkedIn
    ? await prisma.rating.findMany({ where: { eventId: event.id, raterId: member.id }, select: { ratedMemberId: true, choice: true } })
    : [];

  return NextResponse.json({
    event: {
      name: event.name, theme: event.theme.name, startsAt: event.startsAt, city: event.city.name, cancelled: event.status === 'CANCELLED',
      // Who the check-in list shows them: the opposite gender, or everyone.
      ratingAudience: event.ratingAudience,
    },
    myGender: member.gender,
    checkIn: checkInState(event),
    opensAt: opens,
    closesAt: closes,
    // Only a confirmed booking can check in.
    booking: booking?.status === 'CONFIRMED' ? { checkedIn: booking.checkedIn, badge: booking.badge } : null,
    choicesOpen: choicesOpen(event),
    matchesCalculated: event.matchesCalculated,
    myChoices: Object.fromEntries(saved.map((r) => [r.ratedMemberId, r.choice])),
  });
});
