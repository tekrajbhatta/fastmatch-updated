import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionMember } from '@/lib/auth';
import { sendSms } from '@/lib/sms/send';
import { verificationCodeSms } from '@/lib/sms/verificationSms';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { clearRateLimit, hitRateLimit, LIMITS, rateKey } from '@/lib/rateLimit';
import { newMobileCode } from '@/lib/mobileCode';

export const POST = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  if (member.mobileVerified) {
    return NextResponse.json({ error: 'Your mobile is already verified.' }, { status: 400 });
  }

  // Each resend is a paid text.
  const resends = await hitRateLimit(rateKey('resend-code', member.id), LIMITS.codeResends.limit, LIMITS.codeResends.windowMs);
  if (!resends.allowed) {
    return NextResponse.json(
      { error: "You've asked for several codes in the last hour. Please wait a while and try again." },
      { status: 429 },
    );
  }

  const code = newMobileCode();
  await prisma.member.update({
    where: { id: member.id },
    data: { mobileVerificationCode: code, mobileVerificationExpires: new Date(Date.now() + 15 * 60 * 1000) },
  });
  await clearRateLimit(rateKey('mobile-code', member.id)); // a new code: five fresh guesses
  await sendSms({ to: member.mobile, body: verificationCodeSms(code) });

  return NextResponse.json({ ok: true });
});
