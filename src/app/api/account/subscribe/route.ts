import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// POST /api/account/subscribe — "Subscribe to event news and offers" on My
// account: the member opts back in, as the unsubscribe page promises (Gil,
// Q15: members can agree to opt-ins themselves). Blasts go to them again.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  await prisma.member.update({ where: { id: member.id }, data: { marketingOptIn: true } });
  return NextResponse.json({ ok: true });
});
