import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { whyCantCancel, cancelEvent, cancelPreview } from '@/lib/cancelEvent';

/**
 * GET /api/admin/events/:id/cancel — what "Cancel event" would do, for the
 * admin's "are you sure?": how many are booked, how many paid online (and
 * are refunded automatically), and how many paid some other way.
 */
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  return NextResponse.json(await cancelPreview(params.id));
});

/**
 * POST /api/admin/events/:id/cancel — cancels the event: everyone booked is
 * emailed and texted, card payments made online are refunded in full, and
 * every booking is marked cancelled (src/lib/cancelEvent.ts). Not for an
 * event whose night is over, nor one already cancelled — unless that
 * cancellation stopped part-way, which this then finishes.
 */
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const event = await prisma.event.findUniqueOrThrow({ where: { id: params.id }, include: { city: true } });
  const blocked = await whyCantCancel(event);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
  return NextResponse.json(await cancelEvent(event.id));
});
