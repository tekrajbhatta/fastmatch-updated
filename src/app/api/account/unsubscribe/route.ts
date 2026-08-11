import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// POST /api/account/unsubscribe — the in-app "Unsubscribe from emails" option
// on the Account screen. Same effect as the emailed unsubscribe link
// (turns off marketingOptIn only — booking/event confirmations still send),
// just for a member who's already logged in rather than clicking a link.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  await prisma.member.update({ where: { id: member.id }, data: { marketingOptIn: false } });
  return NextResponse.json({ ok: true });
});
