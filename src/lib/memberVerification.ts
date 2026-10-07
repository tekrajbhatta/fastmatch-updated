import { signEmailVerificationToken } from './tokens';
import type { Member } from '@prisma/client';
import { prisma } from './prisma';
import { sendEmail } from './emails/send';
import { welcomeVerificationEmail } from './emails/welcomeEmail';
import { sendSms } from './sms/send';
import { verificationCodeSms } from './sms/verificationSms';
import { clearRateLimit, rateKey } from './rateLimit';
import { newMobileCode } from './mobileCode';

/**
 * The two verification sends a new registrant gets, reusable for members the
 * admin creates as "Unconfirmed", "Confirmed Email" or "Confirmed Phone" —
 * whichever side isn't confirmed gets its link or code, exactly as if the
 * person had signed up themselves. Same token purpose, lifetime and code
 * format as /api/auth/register, so /verify-email and /verify-mobile accept
 * them unchanged.
 *
 * Both are best-effort and never throw; each returns whether it was sent.
 */

export async function sendEmailVerification(member: Pick<Member, 'id' | 'name' | 'email' | 'mobileVerified'>): Promise<boolean> {
  try {
    const token = signEmailVerificationToken(member);
    const verifyUrl = `${process.env.APP_URL}/verify-email?token=${token}`;
    const { subject, html } = welcomeVerificationEmail({ memberName: member.name, verifyUrl, mobileToo: !member.mobileVerified });
    await sendEmail({ to: member.email, subject, html });
    return true;
  } catch (err) {
    console.error(`Member ${member.id}: verification email failed`, err);
    return false;
  }
}

export async function sendMobileVerification(member: Pick<Member, 'id' | 'mobile'>): Promise<boolean> {
  try {
    const code = newMobileCode();
    await prisma.member.update({
      where: { id: member.id },
      data: { mobileVerificationCode: code, mobileVerificationExpires: new Date(Date.now() + 15 * 60 * 1000) },
    });
    await clearRateLimit(rateKey('mobile-code', member.id)); // a new code: five fresh guesses
    await sendSms({ to: member.mobile, body: verificationCodeSms(code) });
    return true;
  } catch (err) {
    console.error(`Member ${member.id}: verification SMS failed`, err);
    return false;
  }
}

/**
 * The admin's "Email/Phone confirmation" select, mapped onto the two flags
 * the rest of the app already checks before a member may book online.
 */
export const CONFIRMATION_OPTIONS = {
  CONFIRMED: { emailVerified: true, mobileVerified: true },
  EMAIL: { emailVerified: true, mobileVerified: false },
  PHONE: { emailVerified: false, mobileVerified: true },
  UNCONFIRMED: { emailVerified: false, mobileVerified: false },
} as const;

export type ConfirmationOption = keyof typeof CONFIRMATION_OPTIONS;
