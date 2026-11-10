import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { sendEmail } from '@/lib/emails/send';
import { finishSignupEmail, alreadyMemberEmail, finishInvitationEmail } from '@/lib/emails/signupEmails';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { nameProblemSentence } from '@/lib/personName';
import { calculateAge } from '@/lib/age';
import { parseDateOfBirth } from '@/lib/friendBooking';
import { setPasswordUrl } from '@/lib/welcomeLink';
import {
  newSignupToken, signupNext, signupCookieWith, throwawaySignupHash,
  PENDING_SIGNUP_DAYS, SIGNUP_COOKIE, SIGNUP_COOKIE_OPTIONS, type PendingSignupData,
} from '@/lib/pendingSignup';
import { allowSiteEmail } from '@/lib/emailVolume';
import { hitRateLimit, rateKey, clientIp, LIMITS } from '@/lib/rateLimit';
import { isAustralianMobile, AU_MOBILE_MESSAGE } from '@/lib/mobile';
import { PASSWORD_MAX, PASSWORD_TOO_LONG } from '@/lib/tokens';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100, 'Please enter a shorter name.'),
  gender: z.enum(['MALE', 'FEMALE']),
  email: z.string().trim().max(254, 'Please enter a valid email address.').email(),
  password: z.string().min(8).max(PASSWORD_MAX, PASSWORD_TOO_LONG),
  cityId: z.string().max(100),
  dateOfBirth: z.string().max(30), // YYYY-MM-DD
  // Australian mobiles only (Gil, Q21).
  mobile: z.string().trim().min(1).max(30, AU_MOBILE_MESSAGE).refine(isAustralianMobile, AU_MOBILE_MESSAGE),
  agreedTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must agree to the Terms & Conditions and Privacy Policy' }),
  }),
  // Only with their say-so: the form's box starts unticked (Gil, Q13).
  marketingOptIn: z.boolean().default(false),
  // Where to come back to afterwards (see signupNext).
  next: z.string().optional(),
});

/**
 * POST /api/auth/register — the sign-up form.
 *
 * Whatever the address, a valid sign-up gets the same answer, { ok: true }:
 * "check your email". It used to say "An account with this email already
 * exists", which let anyone check whether a given person is on FastMatch.
 * What actually happens (src/lib/pendingSignup.ts):
 *   - a new address is emailed a link; the account is created when it's
 *     clicked (/api/auth/complete-signup), and the mobile code texted then;
 *   - a member's address is emailed "you already have an account";
 *   - someone a friend added, still without a password, is emailed a fresh
 *     set-password link.
 * Both paths do the same work (one password hash, one email), so the reply
 * can't hint at the difference either.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    // The mobile's own message, so the form can say what's wrong with it.
    const mobileIssue = parsed.error.issues.find((i) => i.path[0] === 'mobile' && i.message === AU_MOBILE_MESSAGE);
    if (mobileIssue) return NextResponse.json({ error: AU_MOBILE_MESSAGE }, { status: 400 });
    // Something typed far too long: say which, in words (the form shows a string error as it is).
    const tooLong = parsed.error.issues.find((i) => i.code === 'too_big' && ['name', 'email', 'password'].includes(String(i.path[0])));
    if (tooLong) return NextResponse.json({ error: tooLong.message }, { status: 400 });
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const nameIssue = nameProblemSentence(data.name, 'your');
  if (nameIssue) return NextResponse.json({ error: nameIssue, field: 'name' }, { status: 400 });

  const dob = parseDateOfBirth(data.dateOfBirth);
  if (!dob) return NextResponse.json({ error: 'Please enter your date of birth.' }, { status: 400 });
  // Enforce 18+ per the Terms & Conditions — "you must be at least 18 years old"
  if (calculateAge(dob) < 18) {
    return NextResponse.json(
      { error: 'You must be at least 18 years old to register with FastMatch.' },
      { status: 403 }
    );
  }

  const city = await prisma.city.findUnique({ where: { id: data.cityId } });
  if (!city) {
    return NextResponse.json({ error: 'Please select a valid city.' }, { status: 400 });
  }

  // A few sign-ups per internet connection per hour. Every sign-up that gets
  // this far counts, whatever the address, so the limit can't hint at it.
  const attempt = await hitRateLimit(rateKey('register-ip', clientIp(req)), LIMITS.registerIp.limit, LIMITS.registerIp.windowMs);
  if (!attempt.allowed) {
    return NextResponse.json(
      { error: 'There have been several sign-ups from this internet connection in the last hour. Please try again later, or email gil@fastmatch.com.au.' },
      { status: 429 },
    );
  }
  // And only a few emails per address per hour, so nobody can flood someone's
  // inbox through this form. Past that, the answer is the same and nothing is sent.
  const mayEmail = (await hitRateLimit(rateKey('signup-email', data.email), LIMITS.signupEmail.limit, LIMITS.signupEmail.windowMs)).allowed;

  const passwordHash = await bcrypt.hash(data.password, 12);
  const existing = await prisma.member.findUnique({ where: { email: data.email } });
  const appUrl = process.env.APP_URL;
  const next = signupNext(data.next);

  let email: { subject: string; html: string } | null = null;
  // The sign-up this browser is making, if any, for the fm_signup cookie
  // (src/lib/pendingSignup.ts): only then does the link work here without
  // asking for the password again.
  let signupHash: string | null = null;
  if (existing) {
    // Their own name, not the one typed in.
    email = existing.awaitingPasswordSetup
      ? finishInvitationEmail({ name: existing.name, setPasswordUrl: setPasswordUrl(existing, next) })
      : alreadyMemberEmail({
          name: existing.name,
          loginUrl: `${appUrl}/login${next ? `?next=${encodeURIComponent(next)}` : ''}`,
          resetUrl: `${appUrl}/forgot-password`,
        });
  } else if (mayEmail) {
    const now = new Date();
    // Expired sign-ups go whenever a new one comes in.
    await prisma.pendingSignup.deleteMany({ where: { expiresAt: { lt: now } } });
    const { token, tokenHash } = newSignupToken();
    signupHash = tokenHash;
    const details: PendingSignupData = {
      name: data.name,
      gender: data.gender,
      passwordHash,
      cityId: city.id,
      dateOfBirth: data.dateOfBirth.trim(),
      mobile: data.mobile,
      marketingOptIn: data.marketingOptIn,
      ...(next ? { next } : {}),
    };
    await prisma.pendingSignup.create({
      data: {
        tokenHash,
        email: data.email,
        data: details as unknown as object,
        expiresAt: new Date(now.getTime() + PENDING_SIGNUP_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    email = finishSignupEmail({ name: data.name, finishUrl: `${appUrl}/complete-signup?token=${token}` });
  }

  // Within the site-wide hourly ceiling on emails to typed-in addresses
  // (src/lib/emailVolume.ts); past it nothing is sent and the reply is the
  // usual one.
  if (email && mayEmail && (await allowSiteEmail('signup'))) {
    try {
      // A member's own address as saved, not as typed here: the lookup above
      // ignores capitals (and the database treats some other differences as
      // the same), and an email that may carry a set-password link must only
      // ever go to the address on the account.
      await sendEmail({ to: existing ? existing.email : data.email, ...email });
    } catch (err) {
      console.error('Sign-up: email failed', err);
      // The same for every address: the email simply didn't go.
      return NextResponse.json(
        { error: "We couldn't send your email just now. Please try again in a few minutes." },
        { status: 502 },
      );
    }
  }

  const res = NextResponse.json({ ok: true });
  // Set on every sign-up, real or not, with a signature that looks the same
  // either way, so the reply still says nothing about the address.
  res.cookies.set(SIGNUP_COOKIE, signupCookieWith(req.cookies.get(SIGNUP_COOKIE)?.value, signupHash ?? throwawaySignupHash()), SIGNUP_COOKIE_OPTIONS);
  return res;
});
