import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { calculateMatchesForEvent } from '@/lib/calculateMatches';
import { sendMatchEmails } from '@/lib/sendMatchEmails';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { checkInWindow } from '@/lib/eventNight';

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

  const event = await prisma.event.findUniqueOrThrow({ where: { id: params.id }, include: { city: true } });
  const [checkedIn, notEmailed, raters, emailedMatches, emailedBookings] = await Promise.all([
    prisma.booking.count({ where: { eventId: event.id, status: 'CONFIRMED', checkedIn: true } }),
    prisma.booking.count({ where: { eventId: event.id, status: 'CONFIRMED', checkedIn: true, resultsEmailedAt: null } }),
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
    // Worked out, but these people's results haven't gone yet (the nightly
    // job tries again; "Send them now" does it straight away).
    notEmailed: event.matchesCalculated ? notEmailed : 0,
    closeBlocked: closeBlocked(event),
  });
});

/**
 * Why the results can't be worked out early, or null. Not before the night
 * has begun (check-in opens an hour before the start, src/lib/eventNight.ts):
 * nobody can have sent choices yet, and it would lock the results for good
 * (the night's choices wouldn't count) and email anyone already ticked as
 * checked in that they had no matches. Nor for a cancelled event, which
 * didn't happen.
 */
function closeBlocked(event: { status: string; startsAt: Date; city: { name: string } | null }, now: Date = new Date()): string | null {
  if (event.status === 'CANCELLED') return 'This event was cancelled, so there are no results to work out.';
  if (now < checkInWindow(event).opens) return 'This event hasn’t started yet. Results can be worked out early once check-in has opened, an hour before the start.';
  return null;
}

// POST /api/admin/events/:id/close — host's "Close event now & calculate early"
// override. Normally matches wait for the midnight job; this lets a host force
// it sooner. Same underlying calculation either way — no separate logic path.
// Once worked out, it sends any results that haven't gone yet instead.
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const event = await prisma.event.findUniqueOrThrow({ where: { id: params.id }, include: { city: true } });
  if (event.matchesCalculated) {
    // Already worked out: send the results that haven't gone yet, if any.
    const emails = await sendMatchEmails(params.id);
    return NextResponse.json({ alreadyCalculated: true, matchesCreated: 0, emailsSent: emails.sent, emailFailures: emails.failed.map((f) => f.name) });
  }
  const blocked = closeBlocked(event);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const result = await calculateMatchesForEvent(params.id);
  if (result.alreadyCalculated) return NextResponse.json(result);

  // Who couldn't be emailed, so the admin can follow up (their matches are
  // on My Match History either way).
  const emails = await sendMatchEmails(params.id);
  return NextResponse.json({ ...result, emailsSent: emails.sent, emailFailures: emails.failed.map((f) => f.name) });
});
