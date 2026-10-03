import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

const PAGE_SIZE = 20;

// GET /api/admin/feedback?page=&eventId= — "Member Feedback": everything
// members have sent from the Feedback page, newest first.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const params = req.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const eventId = params.get('eventId') || undefined;
  const where = eventId ? { eventId } : {};

  const [items, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      include: {
        member: { select: { id: true, name: true, email: true, mobile: true } },
        event: { select: { id: true, number: true, name: true, startsAt: true, venue: { select: { name: true } }, city: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.feedback.count({ where }),
  ]);

  return NextResponse.json({ items, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total });
});
