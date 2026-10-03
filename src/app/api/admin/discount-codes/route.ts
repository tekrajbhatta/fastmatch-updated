import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { discountValidity } from '@/lib/discountDates';

const codeSchema = z.object({
  code: z.string().min(1).toUpperCase(),
  type: z.enum(['PERCENT_OFF', 'FIXED_REDUCTION', 'FREE']),
  amount: z.number().nonnegative().optional(),
  scopeThemeId: z.string().nullable().optional(),
  // "Event": null or empty = All events; otherwise the one event it works for.
  scopeEventId: z.string().nullable().optional().transform((v) => v || null),
  // "YYYY-MM-DD": whole days in Sydney (src/lib/discountDates.ts).
  validFrom: z.string(),
  validTo: z.string(),
});

export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const codes = await prisma.discountCode.findMany({ orderBy: { validFrom: 'desc' } });
  return NextResponse.json(await withScopeEvents(codes));
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = codeSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const validity = discountValidity(data.validFrom, data.validTo);
  if (!validity) return NextResponse.json({ error: 'Please choose the "Valid from" and "Valid to" dates.' }, { status: 400 });
  if (validity.validTo < validity.validFrom) {
    return NextResponse.json({ error: '"Valid to" can\'t be before "Valid from".' }, { status: 400 });
  }

  if (data.scopeEventId && !(await prisma.event.findUnique({ where: { id: data.scopeEventId }, select: { id: true } }))) {
    return NextResponse.json({ error: 'Please choose a valid event.' }, { status: 400 });
  }

  const existing = await prisma.discountCode.findUnique({ where: { code: data.code } });
  if (existing) {
    return NextResponse.json(
      { error: 'That code already exists. Edit it instead of creating a new one.' },
      { status: 409 }
    );
  }

  const created = await prisma.discountCode.create({
    data: {
      code: data.code,
      type: data.type,
      amount: data.amount,
      scopeThemeId: data.scopeThemeId ?? null,
      scopeEventId: data.scopeEventId,
      ...validity,
    },
  });
  return NextResponse.json(created);
});

// Each code with the event it's limited to (for the list's "Only for" line).
// scopeEvent is null for "All events", and { deleted: true } when the chosen
// event has since been deleted (the code then works for no event).
async function withScopeEvents<T extends { scopeEventId: string | null }>(codes: T[]) {
  const ids = [...new Set(codes.map((c) => c.scopeEventId).filter((id): id is string => !!id))];
  const events = ids.length
    ? await prisma.event.findMany({
        where: { id: { in: ids } },
        select: { id: true, number: true, name: true, startsAt: true, venue: { select: { name: true } }, city: { select: { name: true } } },
      })
    : [];
  const byId = new Map(events.map((e) => [e.id, e]));
  return codes.map((c) => ({
    ...c,
    scopeEvent: c.scopeEventId ? byId.get(c.scopeEventId) ?? { deleted: true } : null,
  }));
}
