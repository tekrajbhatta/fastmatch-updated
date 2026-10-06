import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { calculateMatchesForEvent } from '@/lib/calculateMatches';
import { sendMatchEmails } from '@/lib/sendMatchEmails';
import { withErrorHandling } from '@/lib/withErrorHandling';

/**
 * GET /api/admin/events/:id/close — what the "Close event now" card shows:
 * how many are checked in and how many of them have sent choices (for the
 * confirmation), and once results are in, when they were worked out and how
 * many people were emailed.
 */
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const event = await prisma.event.findUniqueOrThrow({ where: { id: params.id } });
  const [checkedIn, raters, emailedMatches, emailedBookings] = await Promise.all([
    prisma.booking.count({ where: { eventId: event.id, status: 'CONFIRMED', checkedIn: true } }),
    prisma.rating.findMany({ where: { eventId: event.id }, distinct: ['raterId'], select: { raterId: true } }),
    prisma.match.findMany({ where: { eventId: event.id, emailSent: true }, select: { memberAId: true, memberBId: true } }),
    // Everyone emailed their results, with matches or Gil's "no mutual
    // matches" email (the matches above cover events done before this).
    prisma.booking.findMany({ where: { eventId: event.id, resultsEmailedAt: { not: null } }, select: { memberId: true } }),
  ]);
  const emailed = new Set([...emailedMatches.flatMap((m) => [m.memberAId, m.memberBId]), ...emailedBookings.map((b) => b.memberId)]);
  return NextResponse.json({
    checkedIn,
    submitted: raters.length,
    matchesCalculated: event.matchesCalculated,
    matchesCalculatedAt: event.matchesCalculatedAt,
    emailed: emailed.size,
  });
});

// POST /api/admin/events/:id/close — host's "Close event now & calculate early"
// override. Normally matches wait for the midnight job; this lets a host force
// it sooner. Same underlying calculation either way — no separate logic path.
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const result = await calculateMatchesForEvent(params.id);
  if (result.alreadyCalculated) return NextResponse.json(result);

  // Who couldn't be emailed, so the admin can follow up (their matches are
  // on My Match History either way).
  const emails = await sendMatchEmails(params.id);
  return NextResponse.json({ ...result, emailsSent: emails.sent, emailFailures: emails.failed.map((f) => f.name) });
});
