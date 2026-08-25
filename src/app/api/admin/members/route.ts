import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { buildMemberWhere, MemberFilter } from '@/lib/memberFilter';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { calculateAge } from '@/lib/age';

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
  const filter: MemberFilter = {
    search: params.get('search') ?? undefined,
    gender: (params.get('gender') as 'MALE' | 'FEMALE') ?? undefined,
    cityId: params.get('cityId') ?? undefined,
    ageMin: params.get('ageMin') ? Number(params.get('ageMin')) : undefined,
    ageMax: params.get('ageMax') ? Number(params.get('ageMax')) : undefined,
  };
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

const walkInSchema = z.object({
  name: z.string().min(1),
  gender: z.enum(['MALE', 'FEMALE']),
  email: z.string().email(),
  cityId: z.string(),
  dateOfBirth: z.string(),
  mobile: z.string().min(1),
});

// POST /api/admin/members — "Add new member" on the walk-in flow: the host
// entering someone at the door who isn't registered yet. Skips password/
// email/SMS verification entirely — the host is vouching for them in
// person, and they can set a real password via "Forgot password" if they
// ever want to log in online later. Still enforces 18+.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = walkInSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const dob = new Date(data.dateOfBirth);
  // Uses the shared helper rather than a (now - dob) / 365.25 approximation,
  // which drifts by a day around leap years — precisely where an 18th
  // birthday can be misjudged in either direction.
  const age = calculateAge(dob);
  if (age < 18) {
    return NextResponse.json({ error: 'Members must be at least 18 years old.' }, { status: 403 });
  }

  const existing = await prisma.member.findUnique({ where: { email: data.email } });
  if (existing) {
    const { passwordHash: _ph, mobileVerificationCode: _mvc, ...safeExisting } = existing;
    return NextResponse.json(safeExisting); // already a member — just use their existing record, don't duplicate
  }

  const city = await prisma.city.findUnique({ where: { id: data.cityId } });
  if (!city) {
    return NextResponse.json({ error: 'Please select a valid city.' }, { status: 400 });
  }

  const randomPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
  const member = await prisma.member.create({
    data: {
      name: data.name,
      gender: data.gender,
      email: data.email,
      passwordHash: randomPasswordHash,
      cityId: data.cityId,
      dateOfBirth: dob,
      mobile: data.mobile,
      emailVerified: true,
      mobileVerified: true,
      agreedTerms: false, // still needs to accept before booking — same as imported members
    },
  });

  const { passwordHash: _ph2, mobileVerificationCode: _mvc2, ...safeMember } = member;
  return NextResponse.json(safeMember);
});
