import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { readPurposeToken, passwordFingerprint } from '@/lib/tokens';

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
  if (!member) return NextResponse.json({ error: 'Reset link is invalid or has expired.' }, { status: 400 });
  // Single use: the link carries a fingerprint of the password it was issued
  // against, so once any link has set a new password, every earlier one dies.
  // (Links sent before fingerprints existed carry none; they lapse in 30 min.)
  if (t.pwd && t.pwd !== passwordFingerprint(member.passwordHash)) {
    return NextResponse.json({ error: 'This reset link has already been used. Please ask for a new one.' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.member.update({
    where: { id: member.id },
    data: {
      passwordHash,
      // A friend whose "set your password" link expired can come in this way
      // instead: treat it exactly as setting their first password — the
      // welcome link then stops working, and the email is proven theirs.
      ...(member.awaitingPasswordSetup ? { awaitingPasswordSetup: false, emailVerified: true } : {}),
    },
  });

  return NextResponse.json({ ok: true });
});
