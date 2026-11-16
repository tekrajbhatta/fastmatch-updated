import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, canSeeCity, eventInScope, notAuthorized, notFound } from '@/lib/staff';
import { alertFranchiseCancelled } from '@/lib/franchiseAlerts';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { whyCantCancel, cancelEvent, cancelPreview } from '@/lib/cancelEvent';

/**
 * GET /api/admin/events/:id/cancel — what "Cancel event" would do, for the
 * admin's "are you sure?": how many are booked, how many paid online (and
 * are refunded automatically), and how many paid some other way.
 */
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const staff = await requireStaff(req);
  if (!staff) return notAuthorized();
  if (!(await eventInScope(staff, params.id))) return notFound('Event not found');
  return NextResponse.json(await cancelPreview(params.id));
});

/**
 * POST /api/admin/events/:id/cancel — cancels the event: everyone booked is
 * emailed and texted, card payments made online are refunded in full, and
 * every booking is marked cancelled (src/lib/cancelEvent.ts). Not for an
 * event whose night is over, nor one already cancelled — unless that
 * cancellation stopped part-way, which this then finishes. A franchisee can
 * cancel their own events (payments go to FastMatch's Stripe, and are
 * refunded the same way); Gil is texted and emailed when they do.
 */
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const staff = await requireStaff(req);
  if (!staff) return notAuthorized();

  const event = await prisma.event.findUniqueOrThrow({ where: { id: params.id }, include: { city: true, theme: true, venue: true } });
  if (!canSeeCity(staff, event.cityId)) return notFound('Event not found');
  const blocked = await whyCantCancel(event);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
  const outcome = await cancelEvent(event.id);
  if (!staff.isAdmin) {
    const franchisee = { name: staff.member.name, email: staff.member.email };
    after(() => alertFranchiseCancelled({ franchisee, event, outcome }));
  }
  return NextResponse.json(outcome);
});
