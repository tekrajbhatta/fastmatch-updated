import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { signSession } from '@/lib/auth';
import { sendEmail } from '@/lib/emails/send';
import { welcomeVerificationEmail } from '@/lib/emails/welcomeEmail';
import { sendSms } from '@/lib/sms/send';
import { verificationCodeSms } from '@/lib/sms/verificationSms';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { calculateAge } from '@/lib/age';

const JWT_SECRET = process.env.JWT_SECRET as string;

const bodySchema = z.object({
  name: z.string().min(1),
  gender: z.enum(['MALE', 'FEMALE']),
  email: z.string().email(),
  password: z.string().min(8),
  cityId: z.string(),
  dateOfBirth: z.string(), // ISO date
  mobile: z.string().min(1),
  agreedTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must agree to the Terms & Conditions and Privacy Policy' }),
  }),
  marketingOptIn: z.boolean().default(true),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // Enforce 18+ per the Terms & Conditions — "you must be at least 18 years old"
  const dob = new Date(data.dateOfBirth);
  const age = calculateAge(dob);
  if (age < 18) {
    return NextResponse.json(
      { error: 'You must be at least 18 years old to register with FastMatch.' },
      { status: 403 }
    );
  }

  const existing = await prisma.member.findUnique({ where: { email: data.email } });
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
  }

  const city = await prisma.city.findUnique({ where: { id: data.cityId } });
  if (!city) {
    return NextResponse.json({ error: 'Please select a valid city.' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  const member = await prisma.member.create({
    data: {
      name: data.name,
      gender: data.gender,
      email: data.email,
      passwordHash,
      cityId: data.cityId,
      dateOfBirth: dob,
      mobile: data.mobile,
      agreedTerms: true,
      agreedTermsAt: new Date(),
      marketingOptIn: data.marketingOptIn,
      // emailVerified starts false — see /api/auth/verify (TODO) for the
      // confirmation-email step already planned in the spec
    },
  });

  // Verification is required via BOTH email and SMS — emailVerified and
  // mobileVerified are tracked separately; nothing in this app should treat
  // the member as "verified" until both are true.
  const verifyToken = jwt.sign({ memberId: member.id, purpose: 'verify_email' }, JWT_SECRET, {
    expiresIn: '7d',
  });
  const verifyUrl = `${process.env.APP_URL}/verify-email?token=${verifyToken}`;
  const { subject, html } = welcomeVerificationEmail({ memberName: member.name, verifyUrl });

  // Both verification sends are best-effort. The member row is already
  // committed at this point, so letting a provider outage throw would abort
  // the request AFTER creating the account — leaving an orphan with no
  // session, and an email address that then 409s on every retry. Instead we
  // log, report which send failed, and let the member re-request the
  // verification from /verify-mobile (and the email link from their account).
  // Nothing is bypassed: booking stays gated on emailVerified + mobileVerified.
  let emailSent = true;
  try {
    await sendEmail({ to: member.email, subject, html });
  } catch (err) {
    emailSent = false;
    console.error(`Registration ${member.id}: verification email failed`, err);
  }

  const smsCode = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
  await prisma.member.update({
    where: { id: member.id },
    data: {
      mobileVerificationCode: smsCode,
      mobileVerificationExpires: new Date(Date.now() + 15 * 60 * 1000), // 15 min
    },
  });

  let smsSent = true;
  try {
    await sendSms({ to: member.mobile, body: verificationCodeSms(smsCode) });
  } catch (err) {
    smsSent = false;
    console.error(`Registration ${member.id}: verification SMS failed`, err);
  }

  const token = signSession(member.id);

  const res = NextResponse.json({ id: member.id, name: member.name, emailSent, smsSent });
  res.cookies.set('fm_session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
});
