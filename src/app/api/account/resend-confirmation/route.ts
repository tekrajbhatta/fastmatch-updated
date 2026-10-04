import { NextRequest, NextResponse } from 'next/server';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { signEmailVerificationToken } from '@/lib/tokens';
import { sendEmail } from '@/lib/emails/send';
import { confirmEmailAgainEmail } from '@/lib/emails/welcomeEmail';
import { hitRateLimit, rateKey, LIMITS } from '@/lib/rateLimit';

// POST /api/account/resend-confirmation — "Send a new confirmation link", for
// a signed-in member whose email address isn't confirmed (imported, added by
// the admin, or signed up before sign-up confirmed it). They had no way to get
// a fresh link once the first one was lost or had expired.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (member.emailVerified) return NextResponse.json({ error: 'Your email address is already confirmed.' }, { status: 400 });

  if (!(await hitRateLimit(rateKey('confirm-email', member.id), LIMITS.codeResends.limit, LIMITS.codeResends.windowMs)).allowed) {
    return NextResponse.json({ error: "We've sent several links in the last hour. Please check your inbox (and spam folder), or try again later." }, { status: 429 });
  }

  const verifyUrl = `${process.env.APP_URL}/verify-email?token=${signEmailVerificationToken(member)}`;
  try {
    await sendEmail({ to: member.email, ...confirmEmailAgainEmail({ memberName: member.name, verifyUrl }) });
  } catch (err) {
    console.error(`Member ${member.id}: confirmation email failed`, err);
    return NextResponse.json({ error: "We couldn't send the email just now. Please try again in a few minutes." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sentTo: member.email });
});
