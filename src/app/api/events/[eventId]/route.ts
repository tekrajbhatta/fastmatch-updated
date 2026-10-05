import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { getSessionMember } from '@/lib/auth';
import { toPublicEvent } from '@/lib/publicEvent';
import { placesTaken } from '@/lib/capacity';

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

  // Paid places and those held by open payment pages, never counting the
  // viewer's own unpaid attempt against them.
  const { men: menBooked, women: womenBooked } = await placesTaken(event.id, { excludeMemberId: member?.id, excludeEmail: member?.email });

  let alreadyBooked = false;
  let checkedIn = false;
  if (member) {
    const existing = await prisma.booking.findUnique({
      where: { eventId_memberId: { eventId: event.id, memberId: member.id } },
    });
    // Only a paid booking counts. An unpaid one is replaced, and a cancelled
    // or refunded one reopened, when the member books again.
    alreadyBooked = existing?.status === 'CONFIRMED';
    // For the page's "Check in" / "Choose your matches" button on the night.
    checkedIn = alreadyBooked && !!existing?.checkedIn;
  }

  // Only what the page shows (see toPublicEvent), for every event a link can
  // reach, hidden, cancelled and past ones included.
  return NextResponse.json({ ...toPublicEvent(event, { men: menBooked, women: womenBooked }, member?.gender), alreadyBooked, checkedIn });
});
