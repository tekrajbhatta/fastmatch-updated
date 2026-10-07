import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getSessionMember } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { signEmailChangeToken } from '@/lib/tokens';
import { sendEmail } from '@/lib/emails/send';
import { confirmEmailChangeEmail, emailAlreadyUsedEmail } from '@/lib/emails/emailChangeEmails';
import { hitRateLimit, rateKey, LIMITS } from '@/lib/rateLimit';
import { parseDateOfBirth } from '@/lib/friendBooking';
import { calculateAge } from '@/lib/age';
import { sendMobileVerification } from '@/lib/memberVerification';
import { isAustralianMobile, sameMobile, AU_MOBILE_MESSAGE } from '@/lib/mobile';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  mobile: z.string().min(1),
  cityId: z.string(),
  // YYYY-MM-DD. Optional so an older copy of the page that doesn't send it
  // still saves the rest. Age is always worked out from this, never stored.
  dateOfBirth: z.string().optional(),
  // Needed only to change the email address (see below).
  currentPassword: z.string().max(200).optional(),
});

// GET/PATCH /api/account/profile — a member viewing/editing their own
// profile, including email.
//
// A new email address doesn't take effect when the form is saved. A link is
// sent to the new address, and the address changes when it's clicked
// (/api/auth/verify-email), already confirmed. Until then the old one stays.
// That way:
//   - nobody can swap in an address they don't own (and then, say, reset
//     the password through it);
//   - the member is told the same thing whether or not the address already
//     belongs to someone else ("we've sent a link to it"), so this can't be
//     used to check whether a given person is on FastMatch. If it does, its
//     owner gets an email saying someone tried, instead of the link.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { passwordHash, mobileVerificationCode, ...safe } = member;
  return NextResponse.json(safe);
});

export const PATCH = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Please check your details.' }, { status: 400 });

  const { dateOfBirth, ...data } = parsed.data;
  let dob: Date | undefined;
  if (dateOfBirth !== undefined) {
    const d = parseDateOfBirth(dateOfBirth);
    if (!d) return NextResponse.json({ error: 'Please enter a valid date of birth.' }, { status: 400 });
    if (calculateAge(d) < 18) return NextResponse.json({ error: 'You must be at least 18 years old.' }, { status: 400 });
    dob = d;
  }
  const newEmail = data.email.trim();
  const emailChanged = newEmail.toLowerCase() !== member.email.toLowerCase();

  // A few address changes an hour: each one emails an address they typed
  // (and each wrong password below counts too).
  if (emailChanged && !(await hitRateLimit(rateKey('email-change', member.id), LIMITS.emailChange.limit, LIMITS.emailChange.windowMs)).allowed) {
    return NextResponse.json(
      { error: "You've asked to change your email several times in the last hour. Please try again later." },
      { status: 429 },
    );
  }
  // The email address is the way into the account ("Forgot password?"), so
  // changing it needs the current password, as changing the password does:
  // someone using a phone left logged in could otherwise take the account.
  if (emailChanged && !(data.currentPassword && (await bcrypt.compare(data.currentPassword, member.passwordHash)))) {
    return NextResponse.json(
      { error: data.currentPassword ? 'That isn’t your current password.' : 'Please enter your current password to change your email address.', field: 'currentPassword' },
      { status: 400 },
    );
  }

  // A new mobile number isn't confirmed until its code is entered: a member
  // could otherwise switch to any number and stay "confirmed". (Changes the
  // admin makes are trusted.) Each new number is a paid text, so it shares
  // the "Resend code" limit.
  // The same number written differently ("0412 345 678", "+61412345678") isn't a change.
  const mobileChanged = !sameMobile(data.mobile, member.mobile);
  // A new number must be an Australian mobile (Gil, Q21); one already saved is left alone.
  if (mobileChanged && !isAustralianMobile(data.mobile)) {
    return NextResponse.json({ error: AU_MOBILE_MESSAGE }, { status: 400 });
  }
  if (mobileChanged && !(await hitRateLimit(rateKey('resend-code', member.id), LIMITS.codeResends.limit, LIMITS.codeResends.windowMs)).allowed) {
    return NextResponse.json(
      { error: "You've asked for several codes in the last hour. Please wait a while before changing your mobile again." },
      { status: 429 },
    );
  }

  // Everything except the email is saved now.
  const { email: _email, currentPassword: _password, ...rest } = data;
  const updated = await prisma.member.update({
    where: { id: member.id },
    data: { ...rest, ...(dob ? { dateOfBirth: dob } : {}), ...(mobileChanged ? { mobileVerified: false } : {}) },
  });
  const smsSent = mobileChanged ? await sendMobileVerification(updated) : undefined;

  if (emailChanged) {
    const owner = await prisma.member.findUnique({ where: { email: newEmail } });
    const email = owner
      ? emailAlreadyUsedEmail({ name: owner.name })
      : confirmEmailChangeEmail({
          name: updated.name,
          confirmUrl: `${process.env.APP_URL}/verify-email?token=${signEmailChangeToken(updated, newEmail)}`,
        });
    try {
      await sendEmail({ to: newEmail, ...email });
    } catch (err) {
      console.error(`Member ${member.id}: email-change email failed`, err);
      // The same for every address: the email simply didn't go.
      return NextResponse.json(
        { error: "Your other changes are saved, but we couldn't send the email to confirm your new address just now. Please try again in a few minutes." },
        { status: 502 },
      );
    }
  }

  const { passwordHash, mobileVerificationCode, ...safe } = updated;
  // emailChangePending: the address a confirmation link went to (the email itself is unchanged).
  return NextResponse.json({ ...safe, emailChangePending: emailChanged ? newEmail : null, mobileChangePending: mobileChanged, smsSent });
});
