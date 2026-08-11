import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// POST /api/account/accept-terms — for imported members (or anyone who
// hasn't yet), prompted before their first booking since they were never
// asked to agree to this site's Terms & Conditions at sign-up.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  await prisma.member.update({
    where: { id: member.id },
    data: { agreedTerms: true, agreedTermsAt: new Date() },
  });

  return NextResponse.json({ ok: true });
});
