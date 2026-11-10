import { NextRequest, NextResponse } from 'next/server';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { ownDetails } from '@/app/api/account/ownDetails';

// GET /api/auth/me — used by client pages to check who's logged in
export const GET = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ member: null });

  // Only the fields the pages use (src/app/api/account/ownDetails.ts).
  return NextResponse.json({ member: ownDetails(member) });
});
