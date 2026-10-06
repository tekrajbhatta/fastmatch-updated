import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { buildMatchesView } from '@/lib/matchesView';

// GET /api/admin/events/:id/matches — "Matches and choices": who matched with
// whom and everyone's Date / Friend / No choices (src/lib/matchesView.ts).
// Private to the admin: members only ever see their own matches.
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const event = await prisma.event.findUniqueOrThrow({
    where: { id: params.id },
    include: { theme: { select: { name: true } }, city: { select: { name: true } } },
  });
  const [bookings, ratings, matches] = await Promise.all([
    prisma.booking.findMany({
      where: { eventId: event.id, status: 'CONFIRMED' },
      select: { badge: true, checkedIn: true, member: { select: { id: true, name: true, gender: true } } },
    }),
    prisma.rating.findMany({ where: { eventId: event.id }, select: { raterId: true, ratedMemberId: true, choice: true } }),
    prisma.match.findMany({ where: { eventId: event.id }, select: { memberAId: true, memberBId: true, result: true } }),
  ]);

  // Everyone checked in, plus anyone else a choice or a match involves.
  const involved = new Set([...ratings.flatMap((r) => [r.raterId, r.ratedMemberId]), ...matches.flatMap((m) => [m.memberAId, m.memberBId])]);
  const people = bookings
    .filter((b) => b.checkedIn || involved.has(b.member.id))
    .map((b) => ({ id: b.member.id, badge: b.badge, name: b.member.name, gender: b.member.gender }));

  return NextResponse.json({
    event: {
      id: event.id, number: event.number, name: event.name, theme: event.theme.name, startsAt: event.startsAt, city: event.city.name,
      matchesCalculated: event.matchesCalculated, matchesCalculatedAt: event.matchesCalculatedAt, ratingAudience: event.ratingAudience,
    },
    checkedIn: bookings.filter((b) => b.checkedIn).length,
    sentChoices: new Set(ratings.map((r) => r.raterId)).size,
    ...buildMatchesView({ people, ratings, matches }),
  });
});
