import { emailLayout, EMAIL_HEADING } from './layout';
import { BRAND_COLORS } from '../brand';
import { escapeHtml } from '../escapeHtml';
import { PENDING_SIGNUP_DAYS } from '../pendingSignup';
import { signPasswordResetToken } from '../tokens';

// The three emails the sign-up form can send (see src/lib/pendingSignup.ts).
// Which one goes depends on whether the address is already a member's, and
// the form says the same thing either way, so each must make sense on its own
// to whoever owns the inbox. Styling as in welcomeEmail.ts.

const PARA = 'margin:0 0 16px;';
const PARA_BUTTON = 'margin:0 0 24px;';
const BUTTON =
  `background:${BRAND_COLORS.redCta};color:#fff;padding:12px 24px;border-radius:8px;` +
  'text-decoration:none;display:inline-block;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;';
const LINK = `color:${BRAND_COLORS.plum};`;

/** A new address: the link that creates the account. */
export function finishSignupEmail(opts: { name: string; finishUrl: string }) {
  const html = emailLayout(`
    <h1 style="${EMAIL_HEADING}">Welcome to FastMatch, ${escapeHtml(opts.name)}!</h1>
    <p style="${PARA_BUTTON}">Thanks for signing up. Please confirm your email address to finish creating your account:</p>
    <p style="${PARA_BUTTON}"><a href="${opts.finishUrl}" style="${BUTTON}">Confirm my email</a></p>
    <p style="${PARA}">Then we'll text a code to your mobile, and once that's entered you can book events straight away.</p>
    <p style="${PARA}">This link works for ${PENDING_SIGNUP_DAYS} days. If you didn't sign up to FastMatch, just ignore this email: no account has been made.</p>
    <p style="${PARA}">The FastMatch Team</p>
  `);
  return { subject: 'Confirm your email to finish joining FastMatch', html };
}

/** A member's address: they already have an account. Uses the name on the account, not the one typed. */
export function alreadyMemberEmail(opts: { name: string; loginUrl: string; resetUrl: string }) {
  const html = emailLayout(`
    <h1 style="${EMAIL_HEADING}">You already have a FastMatch account</h1>
    <p style="${PARA}">Hi ${escapeHtml(opts.name)}, someone (hopefully you) just tried to sign up to FastMatch with this email address. You're already a member, so there's no need to sign up again.</p>
    <p style="${PARA_BUTTON}"><a href="${opts.loginUrl}" style="${BUTTON}">Log in</a></p>
    <p style="${PARA}">Forgotten your password? <a href="${opts.resetUrl}" style="${LINK}">Choose a new one</a>.</p>
    <p style="${PARA}">If this wasn't you, you can ignore this email. Nothing about your account has changed.</p>
    <p style="${PARA}">The FastMatch Team</p>
  `);
  return { subject: 'You already have a FastMatch account', html };
}

/**
 * Someone a friend added (booked in, or invited), who never chose a password.
 * Sent when they try to sign up, ask to reset a password, or try to log in
 * with one — none of which can work until they've set one — so the opening
 * line says which. The link leads to the "Welcome to FastMatch" form:
 * password, date of birth, terms, offers, then the mobile code.
 */
export function finishInvitationEmail(opts: { name: string; setPasswordUrl: string; reason?: 'signup' | 'reset' | 'login' }) {
  const tried = {
    signup: "just tried to sign up to FastMatch with this email address. A friend has already added you, so there's no need to sign up again: just choose your password to finish.",
    reset: "asked to reset the password for this email address. You haven't chosen a password yet: a friend added you to FastMatch. Choose your password and check your details to finish setting up your account.",
    login: "just tried to log in to FastMatch with this email address. You haven't chosen a password yet: a friend added you to FastMatch. Choose your password and check your details to finish setting up your account.",
  }[opts.reason ?? 'signup'];
  const html = emailLayout(`
    <h1 style="${EMAIL_HEADING}">Your FastMatch account is waiting for you</h1>
    <p style="${PARA}">Hi ${escapeHtml(opts.name)}, someone (hopefully you) ${tried}</p>
    <p style="${PARA_BUTTON}"><a href="${opts.setPasswordUrl}" style="${BUTTON}">Set your password</a></p>
    <p style="${PARA}">If this wasn't you, you can ignore this email.</p>
    <p style="${PARA}">The FastMatch Team</p>
  `);
  return { subject: 'Finish setting up your FastMatch account', html };
}

/** How long the "choose your own password" link in the registered email works. */
export const REGISTERED_PASSWORD_LINK_DAYS = 7;

/** Where a member the admin registered logs in, and the link to choose their own password. */
export interface RegisteredLinks { loginUrl: string; choosePasswordUrl: string }

/** This member's: the log-in page, and a reset link that lasts a week. */
export function registeredLinks(member: { id: string; email: string; passwordHash: string }): RegisteredLinks {
  const appUrl = (process.env.APP_URL ?? '').replace(/\/+$/, '');
  return {
    loginUrl: `${appUrl}/login`,
    choosePasswordUrl: `${appUrl}/reset-password?token=${signPasswordResetToken(member, REGISTERED_PASSWORD_LINK_DAYS * 24 * 60)}`,
  };
}

/**
 * "Log in with the password FastMatch gave you, or choose your own" — the
 * registered email's account part. `greeting` opens it with "Hi <name>, ".
 */
export function registeredAccountHtml(links: RegisteredLinks, greeting = ''): string {
  return `
    <p style="${PARA}">${greeting}FastMatch has registered you with this email address. You can log in with it and the password FastMatch gave you.</p>
    <p style="${PARA_BUTTON}"><a href="${links.loginUrl}" style="${BUTTON}">Log in</a></p>
    <p style="${PARA}">If you'd like to choose your own password instead, you can reset it here: <a href="${links.choosePasswordUrl}" style="${LINK}">choose my own password</a>. This link works for ${REGISTERED_PASSWORD_LINK_DAYS} days. After that, use "Forgot password?" on the log-in page.</p>
  `;
}

/**
 * The admin added this person from the Members page, with a password they
 * were given (never sent by email). They can log in with it, or choose their
 * own here (the user, 6 Oct). Someone added at an event gets this in their
 * booking confirmation instead, as one email (bookingConfirmationEmail).
 */
export function registeredByAdminEmail(opts: { name: string } & RegisteredLinks) {
  const html = emailLayout(`
    <h1 style="${EMAIL_HEADING}">You've been registered with FastMatch</h1>
    ${registeredAccountHtml(opts, `Hi ${escapeHtml(opts.name)}, `)}
    <p style="${PARA}">The FastMatch Team</p>
  `);
  return { subject: "You've been registered with FastMatch", html };
}

