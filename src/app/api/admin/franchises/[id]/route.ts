import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { checkFranchise, franchiseeView, FRANCHISEE_SELECT } from '../shared';

const NOT_FOUND = 'That franchisee no longer exists.';

// PATCH /api/admin/franchises/:id — change a franchisee. The password only
// when one is typed: that also logs them out everywhere else, as any
// password change does. Changing their dates takes effect at once (outside
// them, they're logged out on their next click).
export const PATCH = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const current = await prisma.member.findUnique({ where: { id }, select: { isFranchisee: true } });
  if (!current?.isFranchisee) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

  const checked = await checkFranchise(await req.json().catch(() => null), id);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });
  const { input, franchiseFrom, franchiseTill } = checked;

  try {
    const updated = await prisma.member.update({
      where: { id },
      data: {
        name: input.name,
        email: input.email,
        mobile: input.mobile,
        ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 12) } : {}),
        cityId: input.cityIds[0],
        franchiseFrom,
        franchiseTill,
        franchiseCities: { set: input.cityIds.map((cityId) => ({ id: cityId })) },
      },
      select: FRANCHISEE_SELECT,
    });
    return NextResponse.json(franchiseeView(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: `${input.email} already has an account. Please use another email address.` }, { status: 409 });
    }
    throw err;
  }
});

// DELETE /api/admin/franchises/:id — removes the franchisee's login only
// (Gil's answer 8): their locations' events, venues and discount codes
// belong to the locations, and stay. (A franchise login can't book, rate or
// match, so there's nothing else of theirs; the deletes are only in case.)
export const DELETE = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const current = await prisma.member.findUnique({ where: { id }, select: { isFranchisee: true } });
  if (!current?.isFranchisee) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

  await prisma.$transaction([
    prisma.booking.deleteMany({ where: { memberId: id } }),
    prisma.rating.deleteMany({ where: { OR: [{ raterId: id }, { ratedMemberId: id }] } }),
    prisma.match.deleteMany({ where: { OR: [{ memberAId: id }, { memberBId: id }] } }),
    prisma.member.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
});
