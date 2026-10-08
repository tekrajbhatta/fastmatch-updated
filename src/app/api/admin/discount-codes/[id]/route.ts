import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { Prisma } from '@prisma/client';
import { discountDay } from '@/lib/discountDates';
import { discountInputSchema, checkDiscountInput, DUPLICATE_CODE } from '@/lib/discountInput';

// PATCH /api/admin/discount-codes/:id — edit an existing code in place,
// including reusing an expired one by updating its dates/amount/scope. The
// same checks as creating one (src/lib/discountInput.ts): it used to save
// whatever it was sent. A field not sent keeps its saved value.
export const PATCH = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const current = await prisma.discountCode.findUnique({ where: { id: params.id } });
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = (await req.json().catch(() => null)) ?? {};
  const parsed = discountInputSchema.safeParse({
    code: current.code,
    type: current.type,
    amount: current.amount == null ? null : Number(current.amount),
    scopeThemeId: current.scopeThemeId,
    scopeEventId: current.scopeEventId,
    validFrom: discountDay(current.validFrom),
    validTo: discountDay(current.validTo),
    ...body,
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Please check the code\'s details.' }, { status: 400 });
  const checked = checkDiscountInput(parsed.data);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const data = checked.data;

  // "Event": a newly chosen event must exist. (One chosen earlier and since
  // deleted can stay, so the rest still saves.)
  if (data.scopeEventId && data.scopeEventId !== current.scopeEventId
    && !(await prisma.event.findUnique({ where: { id: data.scopeEventId }, select: { id: true } }))) {
    return NextResponse.json({ error: 'Please choose a valid event.' }, { status: 400 });
  }
  // "Event type": the same, for a newly chosen type.
  if (data.scopeThemeId && data.scopeThemeId !== current.scopeThemeId
    && !(await prisma.eventTheme.findUnique({ where: { id: data.scopeThemeId }, select: { id: true } }))) {
    return NextResponse.json({ error: 'Please choose a valid event type.' }, { status: 400 });
  }
  // Renamed to a code that's already taken.
  if (data.code !== current.code && (await prisma.discountCode.findUnique({ where: { code: data.code }, select: { id: true } }))) {
    return NextResponse.json({ error: DUPLICATE_CODE }, { status: 409 });
  }

  try {
    const updated = await prisma.discountCode.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return NextResponse.json({ error: DUPLICATE_CODE }, { status: 409 });
    throw err;
  }
});

export const DELETE = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  await prisma.discountCode.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
