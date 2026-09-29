import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { buildMemberWhere, MemberFilter } from '@/lib/memberFilter';
import { memberFilterFromParams } from '@/lib/memberFilterParams';
import { withErrorHandling } from '@/lib/withErrorHandling';

const PAGE_SIZE = 50;

// GET /api/admin/members?search=&gender=&cityId=&ageMin=&ageMax=&page=
// Paginated — real member counts run into the tens of thousands, so this
// can never return "everything" at once. Totals (matching count, gender
// split, total matches) are computed over the FULL filtered set via
// database-level aggregates, not just the current page — matches the
// mockup's requirement without loading thousands of rows to do it.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const params = req.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get('page') ?? 1));
  // Same parsing as the members screen and its blast page — see memberFilterFromParams.
  const filter: MemberFilter = memberFilterFromParams(params);
  const where = buildMemberWhere(filter);

  const [members, total, maleCount, femaleCount, totalMatches] = await Promise.all([
    prisma.member.findMany({
      where,
      select: {
        // dateOfBirth is needed for the Age column on the Members screen —
        // age is computed client-side rather than stored.
        id: true, name: true, email: true, mobile: true, gender: true, dateOfBirth: true, createdAt: true,
        city: { select: { name: true } },
        _count: { select: { bookings: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.member.count({ where }),
    prisma.member.count({ where: { ...where, gender: 'MALE' } }),
    prisma.member.count({ where: { ...where, gender: 'FEMALE' } }),
    // Matches where EITHER side is in the filtered set — a DB-level count,
    // not fetched rows, so this stays fast regardless of filtered set size.
    prisma.match.count({ where: { OR: [{ memberA: where }, { memberB: where }] } }),
  ]);

  return NextResponse.json({
    members,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    totals: { count: total, male: maleCount, female: femaleCount, totalMatches },
  });
});
