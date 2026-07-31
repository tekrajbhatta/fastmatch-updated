import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { getSessionMember } from '@/lib/auth';

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
export async function POST(req: NextRequest, ctx: { params: Promise<{ eventId: string }> }) {
  const params = await ctx.params;
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const booking = await prisma.booking.findUnique({
    where: { eventId_memberId: { eventId: params.eventId, memberId: member.id } },
  });
  if (!booking || !booking.checkedIn) {
    return NextResponse.json({ error: 'Not checked in to this event' }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  await prisma.$transaction(
    parsed.data.ratings.map((r) =>
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

  return NextResponse.json({ ok: true });
}
