import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { signSession, SESSION_COOKIE_OPTIONS, rememberDevice } from '@/lib/auth';
import { sendMobileVerification } from '@/lib/memberVerification';
import { hashSignupToken, signupNext, signupCookieHas, SIGNUP_COOKIE, type PendingSignupData } from '@/lib/pendingSignup';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { hitRateLimit, rateKey, MINUTE } from '@/lib/rateLimit';
import { passwordToCheck, TYPED_PASSWORD_MAX } from '@/lib/tokens';

const EXPIRED = 'This link has expired or has already been used. Please sign up again.';
const ALREADY = 'You already have an account with this email address. Please log in.';
const PASSWORD_NEEDED = 'For your security, please enter the password you chose when you signed up.';
const PASSWORD_WRONG = 'That isn’t the password you chose when you signed up. Please try again.';
const TOO_MANY = 'Too many wrong passwords. Please wait 15 minutes and try again, or sign up again with the same email.';

/** Wrong passwords for one sign-up link before it waits out the window. */
const PASSWORD_GUESSES = { limit: 5, windowMs: 15 * MINUTE };

const bodySchema = z.object({
  token: z.string().min(1).max(200),
  // Only asked for when the link is opened in another browser (see below).
  password: z.string().max(TYPED_PASSWORD_MAX).optional(),
});

/**
 * POST /api/auth/complete-signup { token, password? } — the link in the
 * "confirm your email to finish joining" email (src/lib/pendingSignup.ts).
 *
 * Creates the account from what was typed into the sign-up form, with the
 * email already confirmed (the link could only be opened from that inbox),
 * signs them in, and texts the mobile code. The link works once: every
 * waiting sign-up for the address goes once the account exists.
 *
 * In the browser the form was filled in (it carries the fm_signup cookie)
 * that's all. Anywhere else, the password chosen on the form is asked for
 * first: someone may have signed the owner's address up with a password of
 * their own, and confirming it must not hand them the account. The page then
 * shows a password box (code PASSWORD_NEEDED, or PASSWORD_WRONG after a wrong
 * one).
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: EXPIRED }, { status: 400 });

  const tokenHash = hashSignupToken(parsed.data.token);
  const pending = await prisma.pendingSignup.findUnique({ where: { tokenHash } });
  if (!pending || pending.expiresAt < new Date()) return NextResponse.json({ error: EXPIRED }, { status: 400 });

  if (await prisma.member.findUnique({ where: { email: pending.email }, select: { id: true } })) {
    await prisma.pendingSignup.deleteMany({ where: { email: pending.email } });
    return NextResponse.json({ error: ALREADY }, { status: 409 });
  }

  const d = pending.data as unknown as PendingSignupData;
  if (!(await prisma.city.findUnique({ where: { id: d.cityId }, select: { id: true } }))) {
    return NextResponse.json({ error: EXPIRED }, { status: 400 });
  }

  const sameBrowser = signupCookieHas(req.cookies.get(SIGNUP_COOKIE)?.value, tokenHash);
  if (!sameBrowser) {
    const password = parsed.data.password ?? '';
    if (!password) return NextResponse.json({ code: 'PASSWORD_NEEDED', error: PASSWORD_NEEDED }, { status: 401 });
    // A few tries per link, each counted before the (slow) check.
    const tries = await hitRateLimit(rateKey('signup-password', tokenHash), PASSWORD_GUESSES.limit, PASSWORD_GUESSES.windowMs);
    if (!tries.allowed) return NextResponse.json({ code: 'TOO_MANY', error: TOO_MANY }, { status: 429 });
    if (!(await bcrypt.compare(passwordToCheck(password), d.passwordHash))) {
      return NextResponse.json({ code: 'PASSWORD_WRONG', error: PASSWORD_WRONG }, { status: 401 });
    }
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

  // Back to where they were going when they signed up, after the mobile code.
  const res = NextResponse.json({ ok: true, smsSent, next: signupNext(d.next) ?? null });
  res.cookies.set('fm_session', signSession(member), SESSION_COOKIE_OPTIONS);
  // The password was typed in this browser, at sign-up or just now (fm_device, src/lib/auth.ts).
  rememberDevice(res, req, member.id);
  return res;
});
