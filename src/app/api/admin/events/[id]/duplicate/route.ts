import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// POST /api/admin/events/:id/duplicate — "Duplicate event". Copies everything
// the admin typed into the event form, so the admin lands on the copy's edit
// page and usually only changes the date.
//
// Deliberately NOT copied, because they describe the original's history
// rather than its settings:
//   - bookings, ratings, matches
//   - the event number (a new one is assigned)
//   - series membership — the copy is a one-off; otherwise editing or
//     deleting "the series" would sweep it up too
//   - status and the "Event confirmed" tick — a new event starts upcoming
//     and unconfirmed, whatever state the original had reached
//
// The copy starts as a DRAFT (Gil's rule): kept off the public site and
// unbookable until the admin opens it and saves the edit form, so a copy
// still carrying the original's date never shows up twice in public.
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const e = await prisma.event.findUniqueOrThrow({ where: { id: params.id } });

  const copy = await prisma.event.create({
    data: {
      name: e.name,
      description: e.description,
      photoUrl: e.photoUrl,
      themeId: e.themeId,
      cityId: e.cityId,
      venueId: e.venueId,
      startsAt: e.startsAt,
      ageMin: e.ageMin,
      ageMax: e.ageMax,
      maxMen: e.maxMen,
      maxWomen: e.maxWomen,
      cost: e.cost,
      expenses: e.expenses,
      visibility: e.visibility,
      fastmatchDiscounts: e.fastmatchDiscounts,
      groupDiscounts: e.groupDiscounts,
      // Hidden and unbookable until the admin saves it from the edit form.
      draft: true,
    },
  });

  return NextResponse.json({ id: copy.id, number: copy.number, copiedFrom: e.number });
});
