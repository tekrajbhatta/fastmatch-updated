import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

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
  websiteUrl: blankToNull,
  photoUrl: blankToNull,
});

// GET /api/admin/venues/:id — one venue, for the edit form.
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: params.id },
    include: { city: { select: { id: true, name: true } }, _count: { select: { events: true } } },
  });

  return NextResponse.json(venue);
});

// PATCH /api/admin/venues/:id
//
// Editing a venue does NOT rewrite blasts already built from it — selecting a
// venue on a blast copies its details into that blast rather than referencing
// it, so a blast that has been written and proofread can't change underneath
// the admin. Events DO reference the venue, so they show the corrected details.
export const PATCH = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = venueSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Please check the venue details.' }, { status: 400 });
  const data = parsed.data;

  const city = await prisma.city.findUnique({ where: { id: data.cityId } });
  if (!city) return NextResponse.json({ error: 'Please select a valid city.' }, { status: 400 });

  const clash = await prisma.venue.findFirst({
    where: { name: data.name, cityId: data.cityId, NOT: { id: params.id } },
  });
  if (clash) {
    return NextResponse.json({ error: `${data.name} already exists in ${city.name}.` }, { status: 409 });
  }

  const venue = await prisma.venue.update({ where: { id: params.id }, data });
  return NextResponse.json(venue);
});

// DELETE /api/admin/venues/:id — refused while any event still points at it.
//
// Event.venueId is a required FK with ON DELETE RESTRICT, so the database
// would reject this anyway; checking first turns that into a message naming
// how many events are involved instead of a generic 500.
export const DELETE = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: params.id },
    include: { _count: { select: { events: true } } },
  });

  if (venue._count.events > 0) {
    const n = venue._count.events;
    return NextResponse.json(
      { error: `${venue.name} is used by ${n} event${n === 1 ? '' : 's'} and can't be deleted. Edit it instead.` },
      { status: 409 }
    );
  }

  await prisma.venue.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
