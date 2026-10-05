import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { buildOccurrenceDates } from '@/lib/eventSeries';
import { timeZoneForCity } from '@/lib/timezone';
import { checkNewEvent, CHECK_FIELDS } from '@/lib/eventInput';

// GET /api/admin/events — list, newest first
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const events = await prisma.event.findMany({
    orderBy: { startsAt: 'asc' },
    include: { theme: true, city: true, venue: true, _count: { select: { bookings: true } } },
  });

  // Per-gender breakdown for the admin list — "17/24" was showing total
  // bookings only, not the men/women split the screen actually needs.
  const withGenderSplit = await Promise.all(
    events.map(async (e) => {
      const [men, women] = await Promise.all([
        prisma.booking.count({ where: { eventId: e.id, status: 'CONFIRMED', member: { gender: 'MALE' } } }),
        prisma.booking.count({ where: { eventId: e.id, status: 'CONFIRMED', member: { gender: 'FEMALE' } } }),
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

  // The same rules as the form shows under each box (src/lib/eventInput.ts).
  const checked = checkNewEvent(await req.json().catch(() => ({})));
  if (!checked.ok) return NextResponse.json({ error: CHECK_FIELDS, fieldErrors: checked.fieldErrors }, { status: 400 });
  const data = checked.data;

  const first = new Date(data.startsAt);
  const city = await prisma.city.findUnique({ where: { id: data.cityId } });
  if (!city) return NextResponse.json({ error: CHECK_FIELDS, fieldErrors: { cityId: 'Please choose a city.' } }, { status: 400 });

  // Repeats are stepped on the event city's clock (src/lib/eventSeries.ts).
  const startDates = buildOccurrenceDates(first, timeZoneForCity(city.name), data.repeat);

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
          description: data.description,
          photoUrl: data.photoUrl,
          themeId: data.themeId,
          cityId: data.cityId,
          venueId: data.venueId,
          startsAt,
          ageMin: data.ageMin,
          ageMax: data.ageMax,
          maxMen: data.maxMen,
          maxWomen: data.maxWomen,
          cost: data.cost,
          expenses: data.expenses,
          visibility: data.visibility,
          confirmed: data.confirmed,
          fastmatchDiscounts: data.fastmatchDiscounts,
          groupDiscounts: data.groupDiscounts,
          ratingAudience: data.ratingAudience,
          seriesId: series?.id,
        },
      })
    )
  );

  return NextResponse.json({ events, seriesId: series?.id ?? null });
});
