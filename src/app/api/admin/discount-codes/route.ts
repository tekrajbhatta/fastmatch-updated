import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { Prisma } from '@prisma/client';
import { discountInputSchema, checkDiscountInput, DUPLICATE_CODE } from '@/lib/discountInput';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const codes = await prisma.discountCode.findMany({ orderBy: { validFrom: 'desc' } });
  return NextResponse.json(await withScopeEvents(codes));
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  // The same checks as editing (src/lib/discountInput.ts).
  const parsed = discountInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Please check the code\'s details.' }, { status: 400 });
  const checked = checkDiscountInput(parsed.data);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const data = checked.data;

  if (data.scopeEventId && !(await prisma.event.findUnique({ where: { id: data.scopeEventId }, select: { id: true } }))) {
    return NextResponse.json({ error: 'Please choose a valid event.' }, { status: 400 });
  }
  if (data.scopeThemeId && !(await prisma.eventTheme.findUnique({ where: { id: data.scopeThemeId }, select: { id: true } }))) {
    return NextResponse.json({ error: 'Please choose a valid event type.' }, { status: 400 });
  }

  if (await prisma.discountCode.findUnique({ where: { code: data.code }, select: { id: true } })) {
    return NextResponse.json({ error: `${DUPLICATE_CODE} Edit it instead of creating a new one.` }, { status: 409 });
  }

  try {
    const created = await prisma.discountCode.create({ data });
    return NextResponse.json(created);
  } catch (err) {
    // Created by someone else a moment ago.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return NextResponse.json({ error: DUPLICATE_CODE }, { status: 409 });
    throw err;
  }
});

// Each code with the event, or event type, it's limited to (for the list's
// "Only for" line). scopeEvent / scopeTheme is null for "All", and
// { deleted: true } when the chosen one has since been deleted (the code then
// works for no event).
async function withScopeEvents<T extends { scopeEventId: string | null; scopeThemeId: string | null }>(codes: T[]) {
  const ids = [...new Set(codes.map((c) => c.scopeEventId).filter((id): id is string => !!id))];
  const themeIds = [...new Set(codes.map((c) => c.scopeThemeId).filter((id): id is string => !!id))];
  const [events, themes] = await Promise.all([
    ids.length
      ? prisma.event.findMany({
          where: { id: { in: ids } },
          select: { id: true, number: true, name: true, startsAt: true, venue: { select: { name: true } }, city: { select: { name: true } } },
        })
      : [],
    themeIds.length ? prisma.eventTheme.findMany({ where: { id: { in: themeIds } }, select: { id: true, name: true } }) : [],
  ]);
  const byId = new Map(events.map((e) => [e.id, e]));
  const themeById = new Map(themes.map((t) => [t.id, t]));
  return codes.map((c) => ({
    ...c,
    scopeEvent: c.scopeEventId ? byId.get(c.scopeEventId) ?? { deleted: true } : null,
    scopeTheme: c.scopeThemeId ? themeById.get(c.scopeThemeId) ?? { deleted: true } : null,
  }));
}
