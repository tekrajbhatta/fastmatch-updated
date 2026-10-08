import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Member } from '@prisma/client';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { readPurposeToken, passwordFingerprint, sentToCurrentAddress } from '@/lib/tokens';
import { setPasswordPath } from '@/lib/welcomeLink';
import { clearLoginLock, clientIp } from '@/lib/rateLimit';

const bodySchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8),
});

const INVALID = 'Reset link is invalid or has expired.';

/**
 * Is this reset link still good, and for whom? The same checks before the
 * form is shown (GET) as when the new password is saved (POST): the page used
 * to show the form for a missing or dead link, and only said so once a
 * password had been typed.
 */
async function checkResetLink(
  token: string,
): Promise<{ ok: true; member: Member } | { ok: false; status: number; error: string; finishSetupUrl?: string }> {
  const t = readPurposeToken(token, 'password_reset');
  if (!t.ok) return { ok: false, status: 400, error: t.reason === 'invalid' ? INVALID : 'Invalid reset token' };

  const member = await prisma.member.findUnique({ where: { id: t.memberId } });
  // Only for the address it was sent to (an address since corrected doesn't count).
  if (!member || !sentToCurrentAddress(t, member)) return { ok: false, status: 400, error: INVALID };
  // Single use: the link carries a fingerprint of the password it was issued
  // against, so once any link has set a new password, every earlier one dies.
  // (Links sent before fingerprints existed carry none; they lapse in 30 min.)
  if (t.pwd && t.pwd !== passwordFingerprint(member.passwordHash)) {
    return { ok: false, status: 400, error: 'This reset link has already been used. Please ask for a new one.' };
  }

  // Someone a friend added, who has never chosen a password: their password
  // is chosen on the "Welcome to FastMatch" form, along with their details,
  // the terms and the mobile code. "Forgot password" now emails that form
  // instead; this catches a reset link sent before it did.
  if (member.awaitingPasswordSetup) {
    return { ok: false, status: 409, error: 'Your account still needs setting up. Taking you to the welcome form…', finishSetupUrl: setPasswordPath(member) };
  }
  return { ok: true, member };
}

// GET /api/auth/reset-password?token= — whether the link is still good, so
// the page can say so before asking for a password. Nothing is changed.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  if (!token) return NextResponse.json({ error: INVALID }, { status: 400 });
  const link = await checkResetLink(token);
  if (!link.ok) {
    return NextResponse.json({ error: link.error, ...(link.finishSetupUrl ? { finishSetupUrl: link.finishSetupUrl } : {}) }, { status: link.status });
  }
  return NextResponse.json({ ok: true });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const link = await checkResetLink(parsed.data.token);
  if (!link.ok) {
    return NextResponse.json({ error: link.error, ...(link.finishSetupUrl ? { finishSetupUrl: link.finishSetupUrl } : {}) }, { status: link.status });
  }
  const { member } = link;

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  // Their own now, whoever set the old one.
  await prisma.member.update({ where: { id: member.id }, data: { passwordHash, passwordSetByAdmin: false } });
  // "Too many attempts… or use Forgot password?": the new password works straight away.
  await clearLoginLock(member.email, clientIp(req));

  return NextResponse.json({ ok: true });
});
