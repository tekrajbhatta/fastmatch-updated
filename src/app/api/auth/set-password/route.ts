import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { readPurposeToken, PASSWORD_MAX, PASSWORD_TOO_LONG } from '@/lib/tokens';
import { signSession, SESSION_COOKIE_OPTIONS } from '@/lib/auth';
import { calculateAge } from '@/lib/age';
import { parseDateOfBirth } from '@/lib/friendBooking';
import { sendMobileVerification } from '@/lib/memberVerification';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { nameProblemSentence } from '@/lib/personName';
import { isAustralianMobile, sameMobile, AU_MOBILE_MESSAGE } from '@/lib/mobile';

/**
 * /set-password is where someone lands who was put on FastMatch by another
 * member — a friend booked into an event ("bring a friend"), or invited
 * through "Tell A Friend". Either way they never signed up themselves, so
 * this is their registration: choose a password, check the profile details
 * someone else typed for them, agree to the T&Cs, and say whether they want
 * event updates.
 *
 * The link is single use — only accepted while the account is still waiting
 * for its first password. Afterwards "Forgot password" is the way back in.
 */

type TokenResult = { ok: true; memberId: string; email: string | null } | { ok: false; error: string };

// Checked like every other emailed link (src/lib/tokens.ts): signed by us
// with the one signing method, unexpired, and made for setting a password.
// Any failure reads the same to the visitor.
function readToken(token: string): TokenResult {
  const t = token ? readPurposeToken(token, 'set_password') : null;
  if (t?.ok) return { ok: true, memberId: t.memberId, email: t.email ?? null };
  return { ok: false, error: 'This link is invalid or has expired.' };
}

/**
 * The link only works for the address it was sent to: once Gil corrects a
 * friend's mistyped email, the link that went to the wrong inbox is dead
 * (setPasswordToken). "Forgot password?" sends a fresh one.
 */
function sentToMember(t: { email: string | null }, member: { email: string }): boolean {
  return !!t.email && t.email === member.email.toLowerCase();
}

const ALREADY_SET = 'Your password has already been set. Please log in, or use "Forgot password" if you need a new one.';

// GET /api/auth/set-password?token= — what we already know, to prefill the form.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const t = readToken(req.nextUrl.searchParams.get('token') ?? '');
  if (!t.ok) return NextResponse.json({ error: t.error }, { status: 400 });

  const member = await prisma.member.findUnique({
    where: { id: t.memberId },
    include: { referredBy: { select: { name: true } }, _count: { select: { bookings: true } } },
  });
  if (!member || !sentToMember(t, member)) return NextResponse.json({ error: 'This link is invalid or has expired.' }, { status: 400 });
  if (!member.awaitingPasswordSetup) return NextResponse.json({ error: ALREADY_SET }, { status: 400 });

  return NextResponse.json({
    name: member.name,
    email: member.email,
    mobile: member.mobile,
    gender: member.gender,
    cityId: member.cityId,
    // A Tell A Friend invitee's date of birth is only a guess from the age
    // their friend typed, so it's left blank for them to fill in. A friend
    // booked into an event gave a real one — shown for them to check.
    dateOfBirth: member.referredById ? null : member.dateOfBirth.toISOString().slice(0, 10),
    // Once booked into an event their place was taken as that gender, so it
    // can't change here; an invitee's gender was only the inviter's pick.
    canChangeGender: member._count.bookings === 0,
    invitedBy: member.referredBy?.name ?? null,
  });
});

const bodySchema = z.object({
  token: z.string().min(1).max(2000),
  password: z.string().min(8, 'Your password must be at least 8 characters.').max(PASSWORD_MAX, PASSWORD_TOO_LONG),
  name: z.string().trim().min(1, 'Please enter your name.').max(100),
  mobile: z.string().trim().max(30, 'Please enter your mobile number.').regex(/^\+?[\d\s()-]{8,20}$/, 'Please enter your mobile number.'),
  dateOfBirth: z.string().min(1, 'Please enter your date of birth.').max(30, 'Please enter a valid date of birth.'),
  cityId: z.string().min(1, 'Please choose your city.').max(100, 'Please choose your city.'),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  marketingOptIn: z.boolean().default(false),
  agreedTerms: z.literal(true, {
    errorMap: () => ({ message: 'Please agree to the Terms & Conditions and Privacy Policy.' }),
  }),
});

// POST /api/auth/set-password — completes the registration.
//
// Also marks their email verified: the link could only have been opened from
// that inbox, which is what verifying proves. Then, as after registering,
// they're texted a code to confirm their mobile — needed to book events
// themselves — and the page takes them to /verify-mobile.
//
// Logs them straight in, so the next thing they see is the site, not a login
// form asking for the password they just typed.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
  }
  const data = parsed.data;
  const nameIssue = nameProblemSentence(data.name, 'your');
  if (nameIssue) return NextResponse.json({ error: nameIssue, field: 'name' }, { status: 400 });

  const t = readToken(data.token);
  if (!t.ok) return NextResponse.json({ error: t.error }, { status: 400 });

  const member = await prisma.member.findUnique({ where: { id: t.memberId }, include: { _count: { select: { bookings: true } } } });
  if (!member || !sentToMember(t, member)) return NextResponse.json({ error: 'This link is invalid or has expired.' }, { status: 400 });
  if (!member.awaitingPasswordSetup) return NextResponse.json({ error: ALREADY_SET }, { status: 400 });

  // The number their friend typed is left alone; a new one must be an
  // Australian mobile (Gil, Q21).
  if (!sameMobile(data.mobile, member.mobile) && !isAustralianMobile(data.mobile)) {
    return NextResponse.json({ error: AU_MOBILE_MESSAGE }, { status: 400 });
  }
  const dob = parseDateOfBirth(data.dateOfBirth);
  if (!dob) return NextResponse.json({ error: 'Please enter a valid date of birth.' }, { status: 400 });
  if (calculateAge(dob) < 18) return NextResponse.json({ error: 'You must be at least 18 years old to join FastMatch.' }, { status: 400 });
  if (!(await prisma.city.findUnique({ where: { id: data.cityId } }))) {
    return NextResponse.json({ error: 'Please choose your city.' }, { status: 400 });
  }
  const gender = data.gender && member._count.bookings === 0 ? data.gender : member.gender;

  const updated = await prisma.member.update({
    where: { id: member.id },
    data: {
      passwordHash: await bcrypt.hash(data.password, 12),
      name: data.name,
      mobile: data.mobile,
      dateOfBirth: dob,
      cityId: data.cityId,
      gender,
      marketingOptIn: data.marketingOptIn,
      awaitingPasswordSetup: false,
      emailVerified: true,
      agreedTerms: true,
      agreedTermsAt: new Date(),
      // A changed number isn't verified, whatever the old one was.
      ...(data.mobile !== member.mobile ? { mobileVerified: false } : {}),
    },
  });

  const smsSent = updated.mobileVerified ? null : await sendMobileVerification(updated);

  const res = NextResponse.json({ ok: true, name: updated.name, mobileVerified: updated.mobileVerified, smsSent });
  res.cookies.set('fm_session', signSession(updated), SESSION_COOKIE_OPTIONS);
  return res;
});
