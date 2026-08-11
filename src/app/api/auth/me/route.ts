import { NextRequest, NextResponse } from 'next/server';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// GET /api/auth/me — used by client pages to check who's logged in
export const GET = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ member: null });

  const { passwordHash, mobileVerificationCode, ...safe } = member;
  return NextResponse.json({ member: safe });
});
