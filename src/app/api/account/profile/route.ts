import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

const schema = z.object({
  name: z.string().min(1),
  mobile: z.string().min(1),
  cityId: z.string(),
});

// GET/PATCH /api/account/profile — a member viewing/editing their own
// profile. Deliberately narrow — name, mobile, city only. Email changes
// aren't included here since that's tied to login identity and
// verification status; that'd need its own re-verification flow.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { passwordHash, mobileVerificationCode, ...safe } = member;
  return NextResponse.json(safe);
});

export const PATCH = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Please check your details.' }, { status: 400 });

  const updated = await prisma.member.update({ where: { id: member.id }, data: parsed.data });
  const { passwordHash, mobileVerificationCode, ...safe } = updated;
  return NextResponse.json(safe);
});
