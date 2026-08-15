import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

const baseEventSchema = z.object({
  name: z.string().min(1),
  themeId: z.string(),
  cityId: z.string(),
  venue: z.string().min(1),
  startsAt: z.string(), // ISO datetime of the first occurrence
  ageMin: z.number().int().positive(),
  ageMax: z.number().int().positive(),
  maxMen: z.number().int().positive().default(12),
  maxWomen: z.number().int().positive().default(12),
  cost: z.number().nonnegative(),
  expenses: z.number().nonnegative().optional(),
  visibility: z.enum(['PUBLIC', 'NOT_PUBLIC']).default('PUBLIC'),
  repeat: z
    .object({
      frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
      interval: z.number().int().positive().default(1),
      endDate: z.string(), // generates occurrences up to and including this date, not a fixed count
    })
    .optional(),
});

// GET /api/admin/events — list, newest first
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const events = await prisma.event.findMany({
    orderBy: { startsAt: 'asc' },
    include: { theme: true, city: true, _count: { select: { bookings: true } } },
  });

  // Per-gender breakdown for the admin list — "17/24" was showing total
  // bookings only, not the men/women split the screen actually needs.
  const withGenderSplit = await Promise.all(
    events.map(async (e) => {
      const [men, women] = await Promise.all([
        prisma.booking.count({ where: { eventId: e.id, status: { in: ['PENDING', 'CONFIRMED'] }, member: { gender: 'MALE' } } }),
        prisma.booking.count({ where: { eventId: e.id, status: { in: ['PENDING', 'CONFIRMED'] }, member: { gender: 'FEMALE' } } }),
      ]);
      return { ...e, menBooked: men, womenBooked: women };
    })
  );

  return NextResponse.json(withGenderSplit);
});

// POST /api/admin/events — create one event, or a whole repeat series
export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = baseEventSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const startDates = buildOccurrenceDates(new Date(data.startsAt), data.repeat);

  const series = data.repeat
    ? await prisma.eventSeries.create({
        data: { frequency: data.repeat.frequency, interval: data.repeat.interval },
      })
    : null;

  const events = await prisma.$transaction(
    startDates.map((startsAt) =>
      prisma.event.create({
        data: {
          name: data.name,
          themeId: data.themeId,
          cityId: data.cityId,
          venue: data.venue,
          startsAt,
          ageMin: data.ageMin,
          ageMax: data.ageMax,
          maxMen: data.maxMen,
          maxWomen: data.maxWomen,
          cost: data.cost,
          expenses: data.expenses,
          visibility: data.visibility,
          seriesId: series?.id,
        },
      })
    )
  );

  return NextResponse.json({ events, seriesId: series?.id ?? null });
});

function buildOccurrenceDates(
  first: Date,
  repeat?: { frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'; interval: number; endDate: string }
): Date[] {
  if (!repeat) return [first];

  const end = new Date(repeat.endDate);
  const dates: Date[] = [first];
  const SANITY_CAP = 200; // guards against a runaway loop from a bad/far-future end date

  while (dates.length < SANITY_CAP) {
    const d = new Date(dates[dates.length - 1]);
    if (repeat.frequency === 'DAILY') d.setDate(d.getDate() + repeat.interval);
    if (repeat.frequency === 'WEEKLY') d.setDate(d.getDate() + 7 * repeat.interval);
    if (repeat.frequency === 'MONTHLY') d.setMonth(d.getMonth() + repeat.interval);
    if (d > end) break;
    dates.push(d);
  }
  return dates;
}
