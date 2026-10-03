import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { discountValidity, discountDay } from '@/lib/discountDates';

// PATCH /api/admin/discount-codes/:id — edit an existing code in place,
// including reusing an expired one by updating its dates/amount/scope.
export const PATCH = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const updates = await req.json();
  // Whole days in Sydney (src/lib/discountDates.ts). A day not being changed
  // keeps the one already saved.
  if ('validFrom' in updates || 'validTo' in updates) {
    const current = await prisma.discountCode.findUnique({ where: { id: params.id }, select: { validFrom: true, validTo: true } });
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const validity = discountValidity(
      String(updates.validFrom ?? discountDay(current.validFrom)),
      String(updates.validTo ?? discountDay(current.validTo)),
    );
    if (!validity) return NextResponse.json({ error: 'Please choose the "Valid from" and "Valid to" dates.' }, { status: 400 });
    if (validity.validTo < validity.validFrom) {
      return NextResponse.json({ error: '"Valid to" can\'t be before "Valid from".' }, { status: 400 });
    }
    updates.validFrom = validity.validFrom;
    updates.validTo = validity.validTo;
  }
  // "Event": empty means All events; a newly chosen event must exist. (One
  // chosen earlier and since deleted can stay, so the rest still saves.)
  if ('scopeEventId' in updates) {
    updates.scopeEventId = updates.scopeEventId || null;
    const current = await prisma.discountCode.findUnique({ where: { id: params.id }, select: { scopeEventId: true } });
    if (
      updates.scopeEventId &&
      updates.scopeEventId !== current?.scopeEventId &&
      !(await prisma.event.findUnique({ where: { id: updates.scopeEventId }, select: { id: true } }))
    ) {
      return NextResponse.json({ error: 'Please choose a valid event.' }, { status: 400 });
    }
  }

  const updated = await prisma.discountCode.update({ where: { id: params.id }, data: updates });
  return NextResponse.json(updated);
});

export const DELETE = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  await prisma.discountCode.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
