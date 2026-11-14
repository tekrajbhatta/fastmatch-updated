import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Helpers for the Affiliates API (src/lib/affiliates.ts has the rules).
 */

/** The affiliate with this name (any capitals), made if it's new. */
export async function affiliateNamed(db: Prisma.TransactionClient, name: string) {
  return (await db.affiliate.findUnique({ where: { name } })) ?? db.affiliate.create({ data: { name } });
}

/** An affiliate left with no promotions and no bookings is removed: it was only a name. */
export async function removeIfUnused(db: Prisma.TransactionClient, affiliateId: string | null) {
  if (!affiliateId) return;
  const [codes, bookings] = await Promise.all([
    db.discountCode.count({ where: { affiliateId } }),
    db.booking.count({ where: { affiliateId } }),
  ]);
  if (codes === 0 && bookings === 0) await db.affiliate.delete({ where: { id: affiliateId } });
}

/** Whether a promotion has been used: any booking made with it, paid or not, cancelled or refunded. */
export async function promotionUsed(codeId: string): Promise<boolean> {
  const code = await prisma.discountCode.findUnique({ where: { id: codeId }, select: { usedCount: true } });
  if (!code) return false;
  return code.usedCount > 0 || (await prisma.booking.count({ where: { discountCodeId: codeId } })) > 0;
}
