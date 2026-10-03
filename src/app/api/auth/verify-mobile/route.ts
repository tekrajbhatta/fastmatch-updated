import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { clearRateLimit, hitRateLimit, LIMITS, rateKey } from '@/lib/rateLimit';

const bodySchema = z.object({ code: z.string().length(6) });

export const POST = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Enter the 6-digit code from your SMS.' }, { status: 400 });

  if (!member.mobileVerificationCode || !member.mobileVerificationExpires) {
    return NextResponse.json({ error: 'No verification code pending. Request a new one.' }, { status: 400 });
  }
  if (member.mobileVerificationExpires < new Date()) {
    return NextResponse.json({ error: 'This code has expired. Request a new one.' }, { status: 400 });
  }
  if (parsed.data.code !== member.mobileVerificationCode) {
    // Five wrong guesses cancel the code, so it can't be guessed: a new one
    // has to be requested (which starts the count again).
    const guesses = await hitRateLimit(
      rateKey('mobile-code', member.id), LIMITS.mobileCodeGuesses.limit, LIMITS.mobileCodeGuesses.windowMs,
    );
    if (!guesses.allowed || guesses.count >= LIMITS.mobileCodeGuesses.limit) {
      await prisma.member.update({
        where: { id: member.id },
        data: { mobileVerificationCode: null, mobileVerificationExpires: null },
      });
      await clearRateLimit(rateKey('mobile-code', member.id));
      return NextResponse.json({ error: 'Too many wrong codes. Tap "Resend code" for a new one.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Incorrect code.' }, { status: 400 });
  }
  await clearRateLimit(rateKey('mobile-code', member.id));

  await prisma.member.update({
    where: { id: member.id },
    data: { mobileVerified: true, mobileVerificationCode: null, mobileVerificationExpires: null },
  });

  return NextResponse.json({ ok: true });
});
