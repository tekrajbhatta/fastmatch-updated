import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// GET /api/events/:eventId/my-booking — the signed-in member's own booking
// for this event: CONFIRMED (paid), PENDING (payment not confirmed yet),
// CANCELLED, REFUNDED, or NONE. The "You're booked in!" page reads this rather
// than assuming the payment went through.
//
// ?session= (the payment page they've come back from): when that payment
// couldn't be booked — the event filled up after their hold ran out, or was
// cancelled — and was refunded instead, `refundedPayment` says which, and
// whether the refund has gone through (Stripe refused it: Gil refunds it).
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ eventId: string }> }) => {
  const params = await ctx.params;
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const booking = await prisma.booking.findUnique({
    where: { eventId_memberId: { eventId: params.eventId, memberId: member.id } },
    select: { status: true, stripePaymentIntentId: true, confirmedAt: true, event: { select: { status: true } } },
  });
  const session = req.nextUrl.searchParams.get('session');
  const ended = booking?.status === 'REFUNDED' || booking?.status === 'CANCELLED';
  const refundedPayment =
    booking && ended && session && booking.stripePaymentIntentId === session
      ? booking.event.status === 'CANCELLED'
        ? { reason: 'cancelled' as const, refunded: booking.status === 'REFUNDED' }
        // Never confirmed: it was refused as full, not cancelled later by the admin.
        : !booking.confirmedAt ? { reason: 'full' as const, refunded: booking.status === 'REFUNDED' } : null
      : null;
  return NextResponse.json({ status: booking?.status ?? 'NONE', ...(refundedPayment ? { refundedPayment } : {}) });
});
