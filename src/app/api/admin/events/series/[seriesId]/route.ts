import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { cancelBlocked, cancelEvent, type CancelOutcome } from '@/lib/cancelEvent';

const actionSchema = z.object({
  action: z.enum(['DELETE', 'CANCEL', 'SET_NOT_PUBLIC', 'SET_PUBLIC']),
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
    // The city, to show each start on its clock.
    include: { _count: { select: { bookings: true } }, city: { select: { name: true } } },
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

  const events = await prisma.event.findMany({ where, include: { _count: { select: { bookings: true } }, city: true }, orderBy: { startsAt: 'asc' } });

  if (parsed.data.action === 'SET_NOT_PUBLIC') {
    await prisma.event.updateMany({ where, data: { visibility: 'NOT_PUBLIC' } });
    return NextResponse.json({ ok: true, updated: events.length });
  }

  if (parsed.data.action === 'SET_PUBLIC') {
    await prisma.event.updateMany({ where, data: { visibility: 'PUBLIC' } });
    return NextResponse.json({ ok: true, updated: events.length });
  }

  // CANCEL — Gil's YES to "do you want to cancel the event and notify
  // bookings and refund?" after "Delete selected": each is cancelled as from
  // its own page (everyone told, card payments refunded). One already
  // cancelled, or whose night is over, is left alone and said so.
  if (parsed.data.action === 'CANCEL') {
    const total: CancelOutcome & { cancelled: number; skipped: { number: number; reason: string }[] } = {
      cancelled: 0, skipped: [], notified: 0, notifyFailures: [], refunded: [], refundFailed: [], byHand: [], paymentsClosed: 0, paymentsArriving: 0,
    };
    for (const e of events) {
      const blocked = cancelBlocked(e);
      if (blocked) { total.skipped.push({ number: e.number, reason: blocked }); continue; }
      const o = await cancelEvent(e.id);
      total.cancelled++;
      total.notified += o.notified;
      total.notifyFailures.push(...o.notifyFailures);
      total.refunded.push(...o.refunded);
      total.refundFailed.push(...o.refundFailed);
      total.byHand.push(...o.byHand);
      total.paymentsClosed += o.paymentsClosed;
      total.paymentsArriving += o.paymentsArriving;
    }
    return NextResponse.json({ ok: true, ...total });
  }

  // DELETE — events with no bookings are removed entirely. One with bookings
  // is never deleted, and no longer quietly cancelled either (it told nobody
  // and refunded nobody): it's left as it is, and the screen asks whether to
  // cancel it, notify the people booked and refund them (Gil, Q4; "No"
  // leaves it untouched, the user, 4 Oct).
  const toDelete = events.filter((e) => e._count.bookings === 0).map((e) => e.id);
  await prisma.event.deleteMany({ where: { id: { in: toDelete } } });
  const booked = events.filter((e) => e._count.bookings > 0);
  return NextResponse.json({
    ok: true,
    deleted: toDelete.length,
    // Can be cancelled instead, if Gil says yes.
    withBookings: booked.filter((e) => !cancelBlocked(e)).map((e) => ({ id: e.id, number: e.number })),
    // Neither deleted nor cancellable: already cancelled, or already happened.
    leftAlone: booked.filter((e) => cancelBlocked(e)).map((e) => ({ number: e.number, reason: cancelBlocked(e) })),
  });
});
