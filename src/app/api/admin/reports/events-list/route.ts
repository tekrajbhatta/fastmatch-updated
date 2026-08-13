import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// GET /api/admin/reports/events-list — lightweight list for the Per-event
// report's dropdown, most recent first.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const events = await prisma.event.findMany({
    select: { id: true, name: true, startsAt: true, theme: { select: { name: true } } },
    orderBy: { startsAt: 'desc' },
    take: 100,
  });
  return NextResponse.json(events);
});
