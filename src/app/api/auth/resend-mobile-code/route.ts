import { NextRequest, NextResponse } from 'next/server';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { hitRateLimit, LIMITS, rateKey } from '@/lib/rateLimit';
import { textMobileCode } from '@/lib/memberVerification';

export const POST = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  if (member.mobileVerified) {
    return NextResponse.json({ error: 'Your mobile is already verified.' }, { status: 400 });
  }
  // Imported from the old site without one: nothing to text yet.
  if (!member.mobile.trim()) {
    return NextResponse.json({ error: 'Please add your mobile number in your profile first.' }, { status: 400 });
  }

  // Each resend is a paid text.
  const resends = await hitRateLimit(rateKey('resend-code', member.id), LIMITS.codeResends.limit, LIMITS.codeResends.windowMs);
  if (!resends.allowed) {
    return NextResponse.json(
      { error: "You've asked for several codes in the last hour. Please wait a while and try again." },
      { status: 429 },
    );
  }

  // The same send as everywhere else (src/lib/memberVerification.ts), so the
  // limit on texts to any one number covers this button too.
  const sent = await textMobileCode(member);
  if (sent === 'limited') {
    return NextResponse.json(
      { error: "We've sent several codes to this number recently. Please wait an hour or so and try again, or check your number in your profile." },
      { status: 429 },
    );
  }
  // As before, a text that couldn't go is a plain failure.
  if (sent !== 'sent') return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });

  return NextResponse.json({ ok: true });
});
