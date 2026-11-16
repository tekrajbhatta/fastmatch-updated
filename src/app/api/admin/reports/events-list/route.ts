import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, eventScope, notAuthorized } from '@/lib/staff';
import { withErrorHandling } from '@/lib/withErrorHandling';

// GET /api/admin/reports/events-list — every event for the Per-event
// report's list (searchable on the page), most recent first. It used to stop
// at the latest 100, future ones included. Drafts (unsaved duplicates) are
// left out, as in the Summary report. A franchisee's: their locations'
// events within their agreement (src/lib/staff.ts).
export const GET = withErrorHandling(async (req: NextRequest) => {
  const staff = await requireStaff(req);
  if (!staff) return notAuthorized();

  const events = await prisma.event.findMany({
    where: {
      draft: false,
      ...eventScope(staff),
      ...(staff.agreement ? { startsAt: { gte: staff.agreement.from, lte: staff.agreement.till } } : {}),
    },
    select: {
      id: true, number: true, name: true, startsAt: true, ageMin: true, ageMax: true, status: true,
      venue: { select: { name: true, address: true } },
      theme: { select: { name: true } }, city: { select: { name: true } },
    },
    orderBy: { startsAt: 'desc' },
  });
  return NextResponse.json(events);
});
