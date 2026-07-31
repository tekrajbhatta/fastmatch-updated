import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

// PATCH /api/admin/discount-codes/:id — edit an existing code in place,
// including reusing an expired one by updating its dates/amount/scope.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const updates = await req.json();
  if (updates.validFrom) updates.validFrom = new Date(updates.validFrom);
  if (updates.validTo) updates.validTo = new Date(updates.validTo);

  const updated = await prisma.discountCode.update({ where: { id: params.id }, data: updates });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  await prisma.discountCode.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
