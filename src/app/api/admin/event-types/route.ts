import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { eventTypeSchema, duplicateEventType } from '@/lib/eventTypes';

// GET /api/admin/event-types — every event type with how many events use it.
// (The model is EventTheme; Gil calls them event types, as the old admin did.)
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const types = await prisma.eventTheme.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { events: true } } },
  });
  return NextResponse.json(types);
});

// POST /api/admin/event-types — add one.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = eventTypeSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Please enter the event type.' }, { status: 400 });

  if (await duplicateEventType(parsed.data.name)) {
    return NextResponse.json({ error: `"${parsed.data.name}" already exists.` }, { status: 409 });
  }
  const created = await prisma.eventTheme.create({ data: { name: parsed.data.name } });
  return NextResponse.json(created);
});
