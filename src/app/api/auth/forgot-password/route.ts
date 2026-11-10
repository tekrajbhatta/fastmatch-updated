import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { sendEmail } from '@/lib/emails/send';
import { passwordResetEmail } from '@/lib/emails/passwordEmail';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { clientIp, hitRateLimit, LIMITS, rateKey } from '@/lib/rateLimit';
import { signPasswordResetToken, RESET_LINK_MINUTES } from '@/lib/tokens';
import { finishInvitationEmail } from '@/lib/emails/signupEmails';
import { setPasswordUrl } from '@/lib/welcomeLink';
import { allowSiteEmail } from '@/lib/emailVolume';


const bodySchema = z.object({ email: z.string().max(254).email() });

/**
 * Looks the address up and, for a member, emails the link. Runs after the
 * reply has gone (see below), so it never throws.
 */
async function emailResetLink(email: string): Promise<void> {
  try {
    const member = await prisma.member.findUnique({ where: { email } });
    if (!member) return;
    // Someone a friend added, who has never chosen a password, gets the
    // "Welcome to FastMatch" form instead of a bare reset: a reset used to let
    // them in without ever confirming their details (their date of birth was
    // only a guess) or accepting the terms, so they still couldn't book.
    const { subject, html } = member.awaitingPasswordSetup
      ? finishInvitationEmail({ name: member.name, setPasswordUrl: setPasswordUrl(member), reason: 'reset' })
      : passwordResetEmail({
          memberName: member.name,
          // Carries a fingerprint of the current password, so the link dies the
          // moment it (or any other) is used to set a new one.
          resetUrl: `${process.env.APP_URL}/reset-password?token=${signPasswordResetToken(member)}`,
          validMinutes: RESET_LINK_MINUTES,
        });
    // The site-wide hourly ceiling on emails to typed-in addresses
    // (src/lib/emailVolume.ts): past it, nothing is sent. The visitor already
    // has the usual reply.
    if (!(await allowSiteEmail('reset'))) return;
    try {
      await sendEmail({ to: member.email, subject, html });
    } catch (err) {
      console.error(`Password reset email to member ${member.id} failed`, err);
    }
  } catch (err) {
    console.error('Password reset: looking up the address failed', err);
  }
}

// POST /api/auth/forgot-password — always { ok: true }, whether or not the
// address is a member's, so this can't be used to find out who's on
// FastMatch. The look-up and the email happen AFTER the reply: sending one
// used to hold the reply up for a member's address only (a fraction of a
// second talking to the mail server), so timing the answer told the two
// apart even though the words were the same.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid email' }, { status: 400 });

  // Past any limit, nothing is sent, but the reply is the same as always.
  // Per visitor address, and per address asked for: a few an hour, and a few
  // a day on top (so a mailbox can't be sent a reset email every 20 minutes
  // all day long).
  const perAddress = await hitRateLimit(rateKey('reset-ip', clientIp(req)), LIMITS.resetIp.limit, LIMITS.resetIp.windowMs);
  const perEmail = await hitRateLimit(rateKey('reset-email', parsed.data.email), LIMITS.resetEmail.limit, LIMITS.resetEmail.windowMs);
  if (!perAddress.allowed || !perEmail.allowed) return NextResponse.json({ ok: true });
  const perEmailToday = await hitRateLimit(rateKey('reset-email-day', parsed.data.email), LIMITS.resetEmailDaily.limit, LIMITS.resetEmailDaily.windowMs);
  if (!perEmailToday.allowed) return NextResponse.json({ ok: true });

  const email = parsed.data.email;
  after(() => emailResetLink(email));
  return NextResponse.json({ ok: true });
});
