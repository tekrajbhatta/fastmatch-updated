import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// GET /api/admin/reports/events-list — every event for the Per-event
// report's list (searchable on the page), most recent first. It used to stop
// at the latest 100, future ones included. Drafts (unsaved duplicates) are
// left out, as in the Summary report.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const events = await prisma.event.findMany({
    where: { draft: false },
    select: {
      id: true, number: true, name: true, startsAt: true, ageMin: true, ageMax: true, status: true,
      venue: { select: { name: true, address: true } },
      theme: { select: { name: true } }, city: { select: { name: true } },
    },
    orderBy: { startsAt: 'desc' },
  });
  return NextResponse.json(events);
});
