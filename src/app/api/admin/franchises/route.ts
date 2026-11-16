import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { FRANCHISE_PLACEHOLDERS } from '@/lib/franchise';
import { checkFranchise, franchiseeView, FRANCHISEE_SELECT } from './shared';

// GET /api/admin/franchises — the Franchises page (Gil's only): every
// franchisee, A to Z, with their locations and agreement dates.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  const rows = await prisma.member.findMany({ where: { isFranchisee: true }, select: FRANCHISEE_SELECT, orderBy: { name: 'asc' } });
  return NextResponse.json(rows.map((f) => franchiseeView(f)));
});

// POST /api/admin/franchises — a new franchisee: their login (email and the
// password Gil chose, which he gives them), mobile, locations and agreement
// dates (src/lib/franchise.ts). Ready to use: nothing for them to confirm,
// and no emails are sent.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const checked = await checkFranchise(await req.json().catch(() => null));
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });
  const { input, franchiseFrom, franchiseTill } = checked;

  try {
    const created = await prisma.member.create({
      data: {
        name: input.name,
        email: input.email,
        mobile: input.mobile,
        passwordHash: await bcrypt.hash(input.password!, 12),
        ...FRANCHISE_PLACEHOLDERS,
        // Their first location, for the times in any email the site sends them.
        cityId: input.cityIds[0],
        emailVerified: true,
        mobileVerified: true,
        agreedTerms: true,
        agreedTermsAt: new Date(),
        marketingOptIn: false,
        contactMethod: 'DO_NOT_CONTACT',
        isFranchisee: true,
        franchiseFrom,
        franchiseTill,
        franchiseCities: { connect: input.cityIds.map((id) => ({ id })) },
      },
      select: FRANCHISEE_SELECT,
    });
    return NextResponse.json(franchiseeView(created));
  } catch (err) {
    // The same address registered a moment ago.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: `${input.email} already has an account. Please use another email address.` }, { status: 409 });
    }
    throw err;
  }
});
