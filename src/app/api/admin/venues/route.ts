import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// Empty strings arrive from the form's optional inputs; store them as NULL
// rather than '' so "no phone" is one value in the database, not two.
const blankToNull = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

const venueSchema = z.object({
  name: z.string().trim().min(1),
  cityId: z.string().min(1),
  address: blankToNull,
  phone: blankToNull,
  // Not z.string().url() — Gil will type "ggbar.com.au" without a scheme and
  // a hard validation failure on that is more annoying than useful. The UI
  // normalises it to https:// for the href.
  websiteUrl: blankToNull,
  photoUrl: blankToNull,
});

// GET /api/admin/venues?cityId= — the venue directory, and the source for the
// dropdowns on the event and blast forms. cityId filters it, which is how the
// event form narrows venues to the city already chosen on the event.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const cityId = req.nextUrl.searchParams.get('cityId') ?? undefined;

  const venues = await prisma.venue.findMany({
    where: cityId ? { cityId } : undefined,
    include: {
      city: { select: { id: true, name: true } },
      // Drives the "used by N events" note and the delete guard in the UI.
      _count: { select: { events: true } },
    },
    orderBy: [{ city: { name: 'asc' } }, { name: 'asc' }],
  });

  return NextResponse.json(venues);
});

// POST /api/admin/venues — "Create venue".
export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = venueSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Please check the venue details.' }, { status: 400 });
  const data = parsed.data;

  const city = await prisma.city.findUnique({ where: { id: data.cityId } });
  if (!city) return NextResponse.json({ error: 'Please select a valid city.' }, { status: 400 });

  // (name, cityId) is @unique — check first so a duplicate reads as a clear
  // message rather than a raw constraint violation.
  const clash = await prisma.venue.findFirst({ where: { name: data.name, cityId: data.cityId } });
  if (clash) {
    return NextResponse.json({ error: `${data.name} already exists in ${city.name}.` }, { status: 409 });
  }

  const venue = await prisma.venue.create({ data });
  return NextResponse.json(venue);
});
