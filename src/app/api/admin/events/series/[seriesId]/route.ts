import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

const actionSchema = z.object({
  action: z.enum(['DELETE', 'SET_NOT_PUBLIC', 'SET_PUBLIC']),
  eventIds: z.array(z.string()).optional(), // checked rows from the series screen; omitted/empty falls back to the whole series
});

// GET /api/admin/events/series/:seriesId — all events in the series
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ seriesId: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const events = await prisma.event.findMany({
    where: { seriesId: params.seriesId },
    orderBy: { startsAt: 'asc' },
    include: { _count: { select: { bookings: true } } },
  });
  return NextResponse.json(events);
});

// POST /api/admin/events/series/:seriesId — bulk action on the CHECKED
// events only (per-row selection with a "select all" on the series screen),
// not the whole series unconditionally — matches FastmatchLive's current
// pattern. Falls back to the whole series if eventIds is omitted/empty, for
// backward compatibility with any caller that doesn't pass a selection.
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ seriesId: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = actionSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  const where =
    parsed.data.eventIds && parsed.data.eventIds.length > 0
      ? { id: { in: parsed.data.eventIds }, seriesId: params.seriesId } // still scoped to this series, can't bulk-act on events outside it
      : { seriesId: params.seriesId };

  const events = await prisma.event.findMany({ where, include: { _count: { select: { bookings: true } } } });

  if (parsed.data.action === 'SET_NOT_PUBLIC') {
    await prisma.event.updateMany({ where, data: { visibility: 'NOT_PUBLIC' } });
    return NextResponse.json({ ok: true, updated: events.length });
  }

  if (parsed.data.action === 'SET_PUBLIC') {
    await prisma.event.updateMany({ where, data: { visibility: 'PUBLIC' } });
    return NextResponse.json({ ok: true, updated: events.length });
  }

  // DELETE — events with no bookings are removed entirely; events with
  // existing bookings are cancelled instead, so anyone who's already booked
  // and paid is protected. Same distinction confirmed in the old system.
  const toDelete = events.filter((e) => e._count.bookings === 0).map((e) => e.id);
  const toCancel = events.filter((e) => e._count.bookings > 0).map((e) => e.id);

  await prisma.$transaction([
    prisma.event.deleteMany({ where: { id: { in: toDelete } } }),
    prisma.event.updateMany({ where: { id: { in: toCancel } }, data: { status: 'CANCELLED' } }),
  ]);

  return NextResponse.json({ ok: true, deleted: toDelete.length, cancelled: toCancel.length });
});
