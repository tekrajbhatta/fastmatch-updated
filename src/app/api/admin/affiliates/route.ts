import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { affiliateInputSchema, checkAffiliateInput } from '@/lib/affiliates';
import { DUPLICATE_CODE } from '@/lib/discountInput';
import { affiliateNamed } from './shared';

// GET /api/admin/affiliates — the Affiliates page: every promotion (an
// affiliate's discount code), newest first, with how often it has earned a
// commission and how much, and the affiliates' names for the form.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const [codes, affiliates] = await Promise.all([
    prisma.discountCode.findMany({ where: { affiliateId: { not: null } }, include: { affiliate: { select: { id: true, name: true } } }, orderBy: { validFrom: 'desc' } }),
    prisma.affiliate.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  // Commissions earned: paid bookings that recorded one, on events that weren't cancelled.
  const earned = codes.length
    ? await prisma.booking.groupBy({
        by: ['discountCodeId'],
        where: { discountCodeId: { in: codes.map((c) => c.id) }, status: 'CONFIRMED', affiliateCommission: { not: null }, event: { status: { not: 'CANCELLED' } } },
        _count: { _all: true },
        _sum: { affiliateCommission: true },
      })
    : [];
  const byCode = new Map(earned.map((e) => [e.discountCodeId, e]));
  return NextResponse.json({
    affiliates,
    promotions: codes.map((c) => ({
      id: c.id, code: c.code, type: c.type, amount: c.amount, validFrom: c.validFrom, validTo: c.validTo, usedCount: c.usedCount,
      affiliate: c.affiliate, commissionPercent: c.commissionPercent,
      bookings: byCode.get(c.id)?._count._all ?? 0,
      commission: Number(byCode.get(c.id)?._sum.affiliateCommission ?? 0),
    })),
  });
});

// POST /api/admin/affiliates — a new promotion. A new affiliate name makes the affiliate.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = affiliateInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Please check the promotion’s details.' }, { status: 400 });
  const checked = checkAffiliateInput(parsed.data);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  if (await prisma.discountCode.findUnique({ where: { code: checked.code.code }, select: { id: true } })) {
    return NextResponse.json({ error: `${DUPLICATE_CODE} Choose a different code.` }, { status: 409 });
  }
  try {
    const created = await prisma.$transaction(async (tx) => {
      const affiliate = await affiliateNamed(tx, checked.affiliateName);
      return tx.discountCode.create({ data: { ...checked.code, affiliateId: affiliate.id, commissionPercent: checked.commissionPercent } });
    });
    return NextResponse.json(created);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return NextResponse.json({ error: DUPLICATE_CODE }, { status: 409 });
    throw err;
  }
});
