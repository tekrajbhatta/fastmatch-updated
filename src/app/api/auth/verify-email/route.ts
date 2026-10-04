import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { Prisma } from '@prisma/client';
import { readPurposeToken, passwordFingerprint } from '@/lib/tokens';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const t = readPurposeToken(token, 'verify_email');
  // The same page confirms a new address from My Account (see
  // /api/account/profile).
  if (!t.ok && t.reason === 'wrong_purpose') {
    const change = readPurposeToken(token, 'change_email');
    if (change.ok) return applyEmailChange(change);
  }
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

const OUT_OF_DATE = 'This link is out of date. Please change your email again from My Account.';

/**
 * A member confirming a new email address: it becomes their address, already
 * confirmed. Only while the link still matches the account — its old address
 * unchanged and the same password — and only if nobody else has taken the
 * new address since.
 */
async function applyEmailChange(t: { memberId: string; email?: string; from?: string; pwd?: string }) {
  const member = await prisma.member.findUnique({ where: { id: t.memberId } });
  if (!member || !t.email) return NextResponse.json({ error: OUT_OF_DATE }, { status: 400 });
  // Opened twice: it's done already.
  if (member.email.toLowerCase() === t.email) return NextResponse.json({ ok: true, changedTo: member.email });
  if (t.from !== member.email.toLowerCase() || (t.pwd && t.pwd !== passwordFingerprint(member.passwordHash))) {
    return NextResponse.json({ error: OUT_OF_DATE }, { status: 400 });
  }
  const taken = { error: 'That email address now belongs to another account, so your email hasn’t been changed.' };
  if (await prisma.member.findUnique({ where: { email: t.email }, select: { id: true } })) return NextResponse.json(taken, { status: 409 });
  try {
    await prisma.member.update({ where: { id: member.id }, data: { email: t.email, emailVerified: true } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return NextResponse.json(taken, { status: 409 });
    throw err;
  }
  return NextResponse.json({ ok: true, changedTo: t.email });
}
