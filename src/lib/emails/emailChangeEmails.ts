import { emailLayout, EMAIL_HEADING } from './layout';
import { BRAND_COLORS } from '../brand';
import { escapeHtml } from '../escapeHtml';
import { EMAIL_CHANGE_DAYS } from '../tokens';

// The two emails a change of address on My Account can send. The member is
// told the same thing either way ("we've sent a link to the new address"),
// so neither says anything to them about whether the address is a member's.
// Styling as in welcomeEmail.ts.

const PARA = 'margin:0 0 16px;';
const PARA_BUTTON = 'margin:0 0 24px;';
const BUTTON =
  `background:${BRAND_COLORS.redCta};color:#fff;padding:12px 24px;border-radius:8px;` +
  'text-decoration:none;display:inline-block;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;';

/** To the new address: the link that makes the change. */
export function confirmEmailChangeEmail(opts: { name: string; confirmUrl: string }) {
  const html = emailLayout(`
    <h1 style="${EMAIL_HEADING}">Confirm your new email address</h1>
    <p style="${PARA_BUTTON}">Hi ${escapeHtml(opts.name)}, you asked to change the email address on your FastMatch account to this one. Please confirm it:</p>
    <p style="${PARA_BUTTON}"><a href="${opts.confirmUrl}" style="${BUTTON}">Confirm my new email</a></p>
    <p style="${PARA}">Until you do, we'll keep using your current address. This link works for ${EMAIL_CHANGE_DAYS} days.</p>
    <p style="${PARA}">If you didn't ask for this, just ignore this email and nothing will change.</p>
    <p style="${PARA}">The FastMatch Team</p>
  `);
  return { subject: 'Confirm your new FastMatch email address', html };
}

/** To an address that already belongs to another account. Uses that account's own name. */
export function emailAlreadyUsedEmail(opts: { name: string }) {
  const html = emailLayout(`
    <h1 style="${EMAIL_HEADING}">Someone tried to use this email address</h1>
    <p style="${PARA}">Hi ${escapeHtml(opts.name)}, someone with another FastMatch account just tried to change their email to this address. This address already belongs to your account, so nothing has changed.</p>
    <p style="${PARA}">If it was you trying to combine two accounts, please email gil@fastmatch.com.au and we'll sort it out. Otherwise you can ignore this email.</p>
    <p style="${PARA}">The FastMatch Team</p>
  `);
  return { subject: 'Someone tried to use your email address on FastMatch', html };
}
