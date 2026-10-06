import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// POST /api/account/keep-password — "Keep this password", on Finish setting
// up your account: a member the admin added keeps the password they were
// given, and isn't asked again. (Choosing their own clears it too.)
export const POST = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await prisma.member.update({ where: { id: member.id }, data: { passwordSetByAdmin: false } });
  return NextResponse.json({ ok: true });
});
