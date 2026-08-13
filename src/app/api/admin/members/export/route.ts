import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { buildMemberWhere, MemberFilter } from '@/lib/memberFilter';
import { withErrorHandling } from '@/lib/withErrorHandling';

// GET /api/admin/members/export — CSV of the currently filtered member set,
// same filter params as GET /api/admin/members (search/gender/cityId/ageMin/
// ageMax), just no pagination — exports everything that matches.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const params = req.nextUrl.searchParams;
  const filter: MemberFilter = {
    search: params.get('search') ?? undefined,
    gender: (params.get('gender') as 'MALE' | 'FEMALE') ?? undefined,
    cityId: params.get('cityId') ?? undefined,
    ageMin: params.get('ageMin') ? Number(params.get('ageMin')) : undefined,
    ageMax: params.get('ageMax') ? Number(params.get('ageMax')) : undefined,
  };
  const where = buildMemberWhere(filter);

  const members = await prisma.member.findMany({
    where,
    include: { city: true },
    orderBy: { createdAt: 'desc' },
  });

  const header = 'Name,Email,Gender,City,Mobile,Date of Birth,Registered\n';
  const rows = members
    .map((m) =>
      [m.name, m.email, m.gender, m.city.name, m.mobile, m.dateOfBirth.toISOString().slice(0, 10), m.createdAt.toISOString().slice(0, 10)]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n');

  return new NextResponse(header + rows, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="members-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
