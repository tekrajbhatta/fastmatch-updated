import { signEmailVerificationToken } from './tokens';
import type { Member } from '@prisma/client';
import { prisma } from './prisma';
import { sendEmail } from './emails/send';
import { welcomeVerificationEmail } from './emails/welcomeEmail';
import { sendSms } from './sms/send';
import { verificationCodeSms } from './sms/verificationSms';
import { clearRateLimit, hitRateLimit, LIMITS, rateKey } from './rateLimit';
import { australianMobile } from './mobile';
import { maskMobile } from './logMask';
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
  return (await textMobileCode(member)) === 'sent';
}

/**
 * How a verification text went: sent; held back because this number has had
 * its share of codes lately; failed; or no number to text.
 */
export type MobileCodeResult = 'sent' | 'limited' | 'failed' | 'no-mobile';

/**
 * A fresh code, saved and texted. Never throws.
 *
 * A few texts an hour, and a few a day, to any one number, whoever asks:
 * each one is a paid text, and the per-member limits alone let someone with
 * several accounts send code after code to a stranger's phone. Checked first,
 * so a code already sent stays the one to enter. Held back, the caller treats
 * it like a text that couldn't be sent.
 */
export async function textMobileCode(member: Pick<Member, 'id' | 'mobile'>): Promise<MobileCodeResult> {
  if (!member.mobile.trim()) return 'no-mobile'; // no mobile yet (imported from the old site): nothing to text
  try {
    const number = australianMobile(member.mobile) ?? member.mobile.replace(/\D/g, '');
    const hour = await hitRateLimit(rateKey('sms-to', number), LIMITS.smsToNumber.limit, LIMITS.smsToNumber.windowMs);
    const day = hour.allowed ? await hitRateLimit(rateKey('sms-to-day', number), LIMITS.smsToNumberDaily.limit, LIMITS.smsToNumberDaily.windowMs) : null;
    if (!day?.allowed) {
      console.warn(`Member ${member.id}: verification text to ${maskMobile(member.mobile)} held back (that number's limit)`);
      return 'limited';
    }

    const code = newMobileCode();
    await prisma.member.update({
      where: { id: member.id },
      data: { mobileVerificationCode: code, mobileVerificationExpires: new Date(Date.now() + 15 * 60 * 1000) },
    });
    await clearRateLimit(rateKey('mobile-code', member.id)); // a new code: five fresh guesses
    await sendSms({ to: member.mobile, body: verificationCodeSms(code) });
    return 'sent';
  } catch (err) {
    console.error(`Member ${member.id}: verification SMS failed`, err);
    return 'failed';
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
