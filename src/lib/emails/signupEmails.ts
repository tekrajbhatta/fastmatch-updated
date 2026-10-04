import { emailLayout } from './layout';
import { BRAND_COLORS } from '../brand';
import { escapeHtml } from '../escapeHtml';
import { PENDING_SIGNUP_DAYS } from '../pendingSignup';

// The three emails the sign-up form can send (see src/lib/pendingSignup.ts).
// Which one goes depends on whether the address is already a member's, and
// the form says the same thing either way, so each must make sense on its own
// to whoever owns the inbox. Styling as in welcomeEmail.ts.

const HEADING = `margin:0 0 20px;font-family:Arial,sans-serif;font-size:20px;line-height:1.4;font-weight:bold;color:${BRAND_COLORS.plum};`;
const PARA = 'margin:0 0 16px;';
const PARA_BUTTON = 'margin:0 0 24px;';
const BUTTON =
  `background:${BRAND_COLORS.redCta};color:#fff;padding:12px 24px;border-radius:8px;` +
  'text-decoration:none;display:inline-block;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;';
const LINK = `color:${BRAND_COLORS.plum};`;

/** A new address: the link that creates the account. */
export function finishSignupEmail(opts: { name: string; finishUrl: string }) {
  const html = emailLayout(`
    <h1 style="${HEADING}">Welcome to FastMatch, ${escapeHtml(opts.name)}!</h1>
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
    <h1 style="${HEADING}">You already have a FastMatch account</h1>
    <p style="${PARA}">Hi ${escapeHtml(opts.name)}, someone (hopefully you) just tried to sign up to FastMatch with this email address. You're already a member, so there's no need to sign up again.</p>
    <p style="${PARA_BUTTON}"><a href="${opts.loginUrl}" style="${BUTTON}">Log in</a></p>
    <p style="${PARA}">Forgotten your password? <a href="${opts.resetUrl}" style="${LINK}">Choose a new one</a>.</p>
    <p style="${PARA}">If this wasn't you, you can ignore this email. Nothing about your account has changed.</p>
    <p style="${PARA}">The FastMatch Team</p>
  `);
  return { subject: 'You already have a FastMatch account', html };
}

/** Someone a friend added (booked in, or invited), who never chose a password. */
export function finishInvitationEmail(opts: { name: string; setPasswordUrl: string }) {
  const html = emailLayout(`
    <h1 style="${HEADING}">Your FastMatch account is waiting for you</h1>
    <p style="${PARA}">Hi ${escapeHtml(opts.name)}, someone (hopefully you) just tried to sign up to FastMatch with this email address. A friend has already added you, so there's no need to sign up again: just choose your password to finish.</p>
    <p style="${PARA_BUTTON}"><a href="${opts.setPasswordUrl}" style="${BUTTON}">Set your password</a></p>
    <p style="${PARA}">If this wasn't you, you can ignore this email.</p>
    <p style="${PARA}">The FastMatch Team</p>
  `);
  return { subject: 'Finish setting up your FastMatch account', html };
}
