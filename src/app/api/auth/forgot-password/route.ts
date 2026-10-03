import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { sendEmail } from '@/lib/emails/send';
import { passwordResetEmail } from '@/lib/emails/passwordEmail';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { clientIp, hitRateLimit, LIMITS, rateKey } from '@/lib/rateLimit';
import { signPasswordResetToken, RESET_LINK_MINUTES } from '@/lib/tokens';


const bodySchema = z.object({ email: z.string().email() });

export const POST = withErrorHandling(async (req: NextRequest) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid email' }, { status: 400 });

  // Past either limit, nothing is sent, but the reply is the same as always,
  // so this still can't be used to tell which addresses are registered.
  const perAddress = await hitRateLimit(rateKey('reset-ip', clientIp(req)), LIMITS.resetIp.limit, LIMITS.resetIp.windowMs);
  const perEmail = await hitRateLimit(rateKey('reset-email', parsed.data.email), LIMITS.resetEmail.limit, LIMITS.resetEmail.windowMs);
  if (!perAddress.allowed || !perEmail.allowed) return NextResponse.json({ ok: true });

  const member = await prisma.member.findUnique({ where: { email: parsed.data.email } });

  // Always return success, whether or not the email exists — don't let this
  // endpoint be used to check which emails are registered.
  if (member) {
    // Carries a fingerprint of the current password, so the link dies the
    // moment it (or any other) is used to set a new one.
    const resetToken = signPasswordResetToken(member);
    const resetUrl = `${process.env.APP_URL}/reset-password?token=${resetToken}`;
    const { subject, html } = passwordResetEmail({ memberName: member.name, resetUrl, validMinutes: RESET_LINK_MINUTES });
    try {
      await sendEmail({ to: member.email, subject, html });
    } catch (err) {
      // Logged, not returned: an error here would reveal the address exists.
      console.error(`Password reset email to member ${member.id} failed`, err);
    }
  }

  return NextResponse.json({ ok: true });
});
