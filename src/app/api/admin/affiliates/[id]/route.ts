import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { affiliateInputSchema, checkAffiliateInput, PROMOTION_USED } from '@/lib/affiliates';
import { DUPLICATE_CODE } from '@/lib/discountInput';
import { affiliateNamed, removeIfUnused, promotionUsed } from '../shared';

// PATCH /api/admin/affiliates/:id — save a promotion (its discount code's id).
// Bookings already made keep the commission they were paid with (Booking's
// own record), so changing the % only affects bookings from now on (Gil).
export const PATCH = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const current = await prisma.discountCode.findUnique({ where: { id: params.id } });
  if (!current || !current.affiliateId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = affiliateInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Please check the promotion’s details.' }, { status: 400 });
  const checked = checkAffiliateInput(parsed.data);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  if (checked.code.code !== current.code && (await prisma.discountCode.findUnique({ where: { code: checked.code.code }, select: { id: true } }))) {
    return NextResponse.json({ error: DUPLICATE_CODE }, { status: 409 });
  }
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const affiliate = await affiliateNamed(tx, checked.affiliateName);
      const saved = await tx.discountCode.update({
        where: { id: current.id },
        data: { ...checked.code, affiliateId: affiliate.id, commissionPercent: checked.commissionPercent },
      });
      // Renamed to another affiliate: the old name goes if nothing uses it now.
      if (affiliate.id !== current.affiliateId) await removeIfUnused(tx, current.affiliateId);
      return saved;
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return NextResponse.json({ error: DUPLICATE_CODE }, { status: 409 });
    throw err;
  }
});

// DELETE /api/admin/affiliates/:id — only a promotion nobody has used (Gil):
// one that has been used would take its bookings out of the commission
// report. It's stopped by changing its end date instead.
export const DELETE = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const current = await prisma.discountCode.findUnique({ where: { id: params.id } });
  if (!current || !current.affiliateId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (await promotionUsed(current.id)) return NextResponse.json({ error: PROMOTION_USED }, { status: 409 });
  await prisma.$transaction(async (tx) => {
    await tx.discountCode.delete({ where: { id: current.id } });
    await removeIfUnused(tx, current.affiliateId);
  });
  return NextResponse.json({ ok: true });
});
