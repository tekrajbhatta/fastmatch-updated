import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { choicesOpen } from '@/lib/eventNight';
import { canRate } from '@/lib/ratingAudience';

const bodySchema = z.object({
  ratings: z.array(
    z.object({
      ratedMemberId: z.string(),
      choice: z.enum(['NO', 'FRIEND', 'DATE']),
    })
  ),
});

// POST /api/events/:eventId/ratings — "Submit Matches"
// Choices are stored immediately but never calculated here — calculation only
// happens via the midnight job or the host's manual "close event now" action.
//
// Choices close at midnight (Gil: "if they miss midnight deadline... bad
// luck"), or as soon as the results are worked out: they used to be saved and
// silently ignored after that. And only other members checked in to this
// event, on a confirmed booking, can be chosen.
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ eventId: string }> }) => {
  const params = await ctx.params;
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const booking = await prisma.booking.findUnique({
    where: { eventId_memberId: { eventId: params.eventId, memberId: member.id } },
  });
  // A confirmed booking only: someone cancelled or refunded no longer counts,
  // even if they'd been ticked in.
  if (!booking || booking.status !== 'CONFIRMED' || !booking.checkedIn) {
    return NextResponse.json({ error: 'Not checked in to this event' }, { status: 403 });
  }

  const event = await prisma.event.findUniqueOrThrow({ where: { id: params.eventId }, include: { city: true } });
  if (!choicesOpen(event)) {
    return NextResponse.json(
      {
        error: event.matchesCalculated
          ? 'Matches for this event have already been worked out, so choices can no longer be sent.'
          : 'Choices for this event closed at midnight.',
        closed: true,
      },
      { status: 409 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Everyone who can be chosen: checked in, confirmed, not yourself, and
  // someone this event lets you rate (the opposite gender, unless it's an
  // "Everyone" night — src/lib/ratingAudience.ts).
  const present = new Set(
    (await prisma.booking.findMany({
      where: { eventId: params.eventId, status: 'CONFIRMED', checkedIn: true, memberId: { not: member.id } },
      select: { memberId: true, member: { select: { gender: true } } },
    }))
      .filter((b) => canRate(event.ratingAudience, member.gender, b.member.gender))
      .map((b) => b.memberId),
  );
  const valid = parsed.data.ratings.filter((r) => present.has(r.ratedMemberId));

  await prisma.$transaction(
    valid.map((r) =>
      prisma.rating.upsert({
        where: {
          eventId_raterId_ratedMemberId: {
            eventId: params.eventId,
            raterId: member.id,
            ratedMemberId: r.ratedMemberId,
          },
        },
        create: {
          eventId: params.eventId,
          raterId: member.id,
          ratedMemberId: r.ratedMemberId,
          choice: r.choice,
        },
        update: { choice: r.choice },
      })
    )
  );

  return NextResponse.json({ ok: true, saved: valid.length, skipped: parsed.data.ratings.length - valid.length });
});
