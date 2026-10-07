import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { readPurposeToken, passwordFingerprint, sentToCurrentAddress } from '@/lib/tokens';
import { setPasswordPath } from '@/lib/welcomeLink';
import { clearLoginLock, clientIp } from '@/lib/rateLimit';

const bodySchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const t = readPurposeToken(parsed.data.token, 'password_reset');
  if (!t.ok) {
    return t.reason === 'invalid'
      ? NextResponse.json({ error: 'Reset link is invalid or has expired.' }, { status: 400 })
      : NextResponse.json({ error: 'Invalid reset token' }, { status: 400 });
  }

  const member = await prisma.member.findUnique({ where: { id: t.memberId } });
  // Only for the address it was sent to (an address since corrected doesn't count).
  if (!member || !sentToCurrentAddress(t, member)) return NextResponse.json({ error: 'Reset link is invalid or has expired.' }, { status: 400 });
  // Single use: the link carries a fingerprint of the password it was issued
  // against, so once any link has set a new password, every earlier one dies.
  // (Links sent before fingerprints existed carry none; they lapse in 30 min.)
  if (t.pwd && t.pwd !== passwordFingerprint(member.passwordHash)) {
    return NextResponse.json({ error: 'This reset link has already been used. Please ask for a new one.' }, { status: 400 });
  }

  // Someone a friend added, who has never chosen a password: their password
  // is chosen on the "Welcome to FastMatch" form, along with their details,
  // the terms and the mobile code. "Forgot password" now emails that form
  // instead; this catches a reset link sent before it did.
  if (member.awaitingPasswordSetup) {
    return NextResponse.json(
      { error: 'Your account still needs setting up. Taking you to the welcome form…', finishSetupUrl: setPasswordPath(member) },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  // Their own now, whoever set the old one.
  await prisma.member.update({ where: { id: member.id }, data: { passwordHash, passwordSetByAdmin: false } });
  // "Too many attempts… or use Forgot password?": the new password works straight away.
  await clearLoginLock(member.email, clientIp(req));

  return NextResponse.json({ ok: true });
});
