import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, eventScope, eventPlaceProblem, notAuthorized } from '@/lib/staff';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { buildOccurrenceDates } from '@/lib/eventSeries';
import { timeZoneForCity } from '@/lib/timezone';
import { checkNewEvent, CHECK_FIELDS } from '@/lib/eventInput';
import { ADMIN_EVENT_INCLUDE, placesByEvent } from '@/lib/adminEvents';

// GET /api/admin/events — list, newest first. A franchisee's: their
// locations' (src/lib/staff.ts).
export const GET = withErrorHandling(async (req: NextRequest) => {
  const staff = await requireStaff(req);
  if (!staff) return notAuthorized();

  const [events, places] = await Promise.all([
    prisma.event.findMany({ where: eventScope(staff), orderBy: { startsAt: 'asc' }, include: ADMIN_EVENT_INCLUDE }),
    placesByEvent(),
  ]);

  // Per-gender breakdown for the admin list — "17/24" was showing total
  // bookings only, not the men/women split the screen actually needs.
  return NextResponse.json(events.map((e) => ({ ...e, menBooked: places.get(e.id)?.men ?? 0, womenBooked: places.get(e.id)?.women ?? 0 })));
});

// POST /api/admin/events — create one event, or a whole repeat series. A
// franchisee's are in their locations, at a venue there.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const staff = await requireStaff(req);
  if (!staff) return notAuthorized();

  // The same rules as the form shows under each box (src/lib/eventInput.ts).
  const checked = checkNewEvent(await req.json().catch(() => ({})));
  if (!checked.ok) return NextResponse.json({ error: CHECK_FIELDS, fieldErrors: checked.fieldErrors }, { status: 400 });
  const data = checked.data;
  const outside = await eventPlaceProblem(staff, data.cityId, data.venueId);
  if (outside) return NextResponse.json({ error: CHECK_FIELDS, fieldErrors: outside }, { status: 400 });

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
          offering: data.offering,
          seriesId: series?.id,
        },
      })
    )
  );

  return NextResponse.json({ events, seriesId: series?.id ?? null });
});
