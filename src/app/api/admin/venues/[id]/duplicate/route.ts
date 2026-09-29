import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// POST /api/admin/venues/:id/duplicate — "Duplicate". Same value in every
// field, except the name gets "(copy)": a city can't have two venues with the
// same name (the directory would be ambiguous in every dropdown), and it
// matches how duplicated blasts are named. The admin renames it straight away.
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const v = await prisma.venue.findUniqueOrThrow({ where: { id: params.id } });

  // "GG Bar (copy)", then "GG Bar (copy 2)"… if that's taken too.
  let name = `${v.name} (copy)`;
  for (let n = 2; await prisma.venue.findFirst({ where: { name, cityId: v.cityId } }); n++) {
    name = `${v.name} (copy ${n})`;
  }

  const copy = await prisma.venue.create({
    data: {
      name,
      cityId: v.cityId,
      address: v.address,
      phone: v.phone,
      websiteUrl: v.websiteUrl,
      logoUrl: v.logoUrl,
      imageUrl: v.imageUrl,
      description: v.description,
    },
    include: { city: { select: { id: true, name: true } }, _count: { select: { events: true } } },
  });
  return NextResponse.json(copy);
});
