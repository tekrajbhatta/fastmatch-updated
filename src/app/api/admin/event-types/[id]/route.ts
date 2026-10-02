import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { eventTypeSchema, duplicateEventType } from '@/lib/eventTypes';

// PATCH /api/admin/event-types/:id — rename. Events point at the type, so
// every event of this type shows the new name straight away.
export const PATCH = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = eventTypeSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Please enter the event type.' }, { status: 400 });

  const existing = await prisma.eventTheme.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'That event type no longer exists.' }, { status: 404 });

  if (await duplicateEventType(parsed.data.name, id)) {
    return NextResponse.json({ error: `"${parsed.data.name}" already exists.` }, { status: 409 });
  }
  const updated = await prisma.eventTheme.update({ where: { id }, data: { name: parsed.data.name } });
  return NextResponse.json(updated);
});

// DELETE /api/admin/event-types/:id — only while no event uses it, as with
// venues: every event needs a type, so a type in use can be renamed instead.
export const DELETE = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const type = await prisma.eventTheme.findUnique({ where: { id }, include: { _count: { select: { events: true } } } });
  if (!type) return NextResponse.json({ error: 'That event type no longer exists.' }, { status: 404 });

  const used = type._count.events;
  if (used > 0) {
    return NextResponse.json(
      { error: `"${type.name}" is used by ${used} event${used === 1 ? '' : 's'} and can't be deleted. Edit it instead.` },
      { status: 409 },
    );
  }
  await prisma.eventTheme.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
