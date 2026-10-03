import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { readPurposeToken } from '@/lib/tokens';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const t = readPurposeToken(token, 'verify_email');
  if (!t.ok) {
    return t.reason === 'invalid'
      ? NextResponse.json({ error: 'This link is invalid or has expired.' }, { status: 400 })
      : NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const member = await prisma.member.findUnique({ where: { id: t.memberId } });
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // A link confirms only the address it was sent to: one sent before an email
  // change mustn't confirm the new address. (Links sent before this check
  // existed carry no address; they lapse within 7 days.)
  if (t.email && t.email !== member.email.toLowerCase()) {
    return NextResponse.json(
      { error: 'This link was for a different email address. Please use the link in the most recent email we sent you.' },
      { status: 400 },
    );
  }

  await prisma.member.update({ where: { id: member.id }, data: { emailVerified: true } });
  return NextResponse.json({ ok: true });
});
