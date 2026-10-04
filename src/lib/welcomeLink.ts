import { setPasswordToken } from './memberBooking';
import { sendEmail } from './emails/send';
import { finishInvitationEmail } from './emails/signupEmails';
import { hitRateLimit, rateKey, LIMITS } from './rateLimit';

/**
 * The "Welcome to FastMatch" form for an account a friend set up (booked in,
 * or invited) that has never had a password: /set-password, where they
 * choose one, check their details, accept the terms and confirm their mobile.
 * `next` (a page on this site, already checked) is where they carry on to
 * afterwards — the event they were booking, say.
 */
export function setPasswordPath(memberId: string, next?: string | null): string {
  return `/set-password?token=${setPasswordToken(memberId)}${next ? `&next=${encodeURIComponent(next)}` : ''}`;
}

export function setPasswordUrl(memberId: string, next?: string | null): string {
  return `${process.env.APP_URL}${setPasswordPath(memberId, next)}`;
}

/**
 * A wrong password on an account a friend set up — it has no password yet,
 * so every password is wrong: quietly email a fresh link to the welcome form,
 * a few an hour at most. Never throws (it runs after the login reply).
 */
export async function emailWelcomeLinkOnLogin(member: { id: string; name: string; email: string }): Promise<void> {
  try {
    const { limit, windowMs } = LIMITS.welcomeLinkOnLogin;
    if (!(await hitRateLimit(rateKey('welcome-link-login', member.email), limit, windowMs)).allowed) return;
    const { subject, html } = finishInvitationEmail({ name: member.name, setPasswordUrl: setPasswordUrl(member.id), reason: 'login' });
    await sendEmail({ to: member.email, subject, html });
  } catch (err) {
    console.error(`Member ${member.id}: set-password link after a login attempt failed`, err);
  }
}
