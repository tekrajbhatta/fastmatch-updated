import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// GET /api/events/:eventId/my-booking — the signed-in member's own booking
// for this event: CONFIRMED (paid), PENDING (payment not confirmed yet),
// CANCELLED, REFUNDED, or NONE. The "You're booked in!" page reads this rather
// than assuming the payment went through.
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ eventId: string }> }) => {
  const params = await ctx.params;
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const booking = await prisma.booking.findUnique({
    where: { eventId_memberId: { eventId: params.eventId, memberId: member.id } },
    select: { status: true },
  });
  return NextResponse.json({ status: booking?.status ?? 'NONE' });
});
