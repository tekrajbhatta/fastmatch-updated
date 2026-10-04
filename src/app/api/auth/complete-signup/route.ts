import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { signSession, SESSION_COOKIE_OPTIONS } from '@/lib/auth';
import { sendMobileVerification } from '@/lib/memberVerification';
import { hashSignupToken, type PendingSignupData } from '@/lib/pendingSignup';
import { withErrorHandling } from '@/lib/withErrorHandling';

const EXPIRED = 'This link has expired or has already been used. Please sign up again.';
const ALREADY = 'You already have an account with this email address. Please log in.';

/**
 * POST /api/auth/complete-signup { token } — the link in the "confirm your
 * email to finish joining" email (src/lib/pendingSignup.ts).
 *
 * Creates the account from what was typed into the sign-up form, with the
 * email already confirmed (the link could only be opened from that inbox),
 * signs them in, and texts the mobile code. The link works once: every
 * waiting sign-up for the address goes once the account exists.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const parsed = z.object({ token: z.string().min(1) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: EXPIRED }, { status: 400 });

  const pending = await prisma.pendingSignup.findUnique({ where: { tokenHash: hashSignupToken(parsed.data.token) } });
  if (!pending || pending.expiresAt < new Date()) return NextResponse.json({ error: EXPIRED }, { status: 400 });

  if (await prisma.member.findUnique({ where: { email: pending.email }, select: { id: true } })) {
    await prisma.pendingSignup.deleteMany({ where: { email: pending.email } });
    return NextResponse.json({ error: ALREADY }, { status: 409 });
  }

  const d = pending.data as unknown as PendingSignupData;
  if (!(await prisma.city.findUnique({ where: { id: d.cityId }, select: { id: true } }))) {
    return NextResponse.json({ error: EXPIRED }, { status: 400 });
  }

  let member;
  try {
    member = await prisma.member.create({
      data: {
        name: d.name,
        gender: d.gender,
        email: pending.email,
        passwordHash: d.passwordHash,
        cityId: d.cityId,
        dateOfBirth: new Date(d.dateOfBirth),
        mobile: d.mobile,
        agreedTerms: true,
        agreedTermsAt: pending.createdAt, // when they ticked the box
        marketingOptIn: d.marketingOptIn,
        emailVerified: true,
      },
    });
  } catch (err) {
    // The same link opened twice at once: the other request made the account.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: ALREADY }, { status: 409 });
    }
    throw err;
  }
  await prisma.pendingSignup.deleteMany({ where: { email: pending.email } });

  // Best-effort, as at sign-up before: the account exists either way, and the
  // code can be resent from /verify-mobile.
  const smsSent = await sendMobileVerification(member);

  const res = NextResponse.json({ ok: true, smsSent });
  res.cookies.set('fm_session', signSession(member), SESSION_COOKIE_OPTIONS);
  return res;
});
