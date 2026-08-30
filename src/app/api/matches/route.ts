import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { getSessionMember } from '@/lib/auth';

// GET /api/matches — the logged-in member's own match results, grouped by
// event, most recent first. Powers the My Matches page.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const matches = await prisma.match.findMany({
    where: { OR: [{ memberAId: member.id }, { memberBId: member.id }] },
    include: { event: { include: { venue: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const otherIds = matches.map((m) => (m.memberAId === member.id ? m.memberBId : m.memberAId));
  const others = await prisma.member.findMany({
    where: { id: { in: otherIds } },
    select: { id: true, name: true, email: true, mobile: true },
  });
  const otherById = new Map(others.map((o) => [o.id, o]));

  const byEvent = new Map<string, { event: typeof matches[0]['event']; dateMatches: typeof others; friendMatches: typeof others }>();
  for (const m of matches) {
    const otherId = m.memberAId === member.id ? m.memberBId : m.memberAId;
    const other = otherById.get(otherId);
    if (!other) continue;
    if (!byEvent.has(m.eventId)) byEvent.set(m.eventId, { event: m.event, dateMatches: [], friendMatches: [] });
    const entry = byEvent.get(m.eventId)!;
    if (m.result === 'DATE') entry.dateMatches.push(other);
    else entry.friendMatches.push(other);
  }

  return NextResponse.json(Array.from(byEvent.values()));
});
