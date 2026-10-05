import { emailLayout, EMAIL_HEADING } from './layout';
import { BRAND_COLORS } from '../brand';
import { escapeHtml } from '../escapeHtml';

// Email clients ignore <style> blocks and external stylesheets, so every rule
// has to be inline. The heading's style is EMAIL_HEADING, shared by every email.

// Explicit paragraph margins — several clients zero out the default <p>
// margin, which runs every line together into one block.
const PARA = 'margin:0 0 16px;';
const PARA_BUTTON = 'margin:0 0 24px;';

const BUTTON =
  `background:${BRAND_COLORS.redCta};color:#fff;padding:12px 24px;border-radius:8px;` +
  'text-decoration:none;display:inline-block;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;';

export function welcomeVerificationEmail(opts: { memberName: string; verifyUrl: string }) {
  const html = emailLayout(`
    <h1 style="${EMAIL_HEADING}">Welcome to FastMatch, ${escapeHtml(opts.memberName)}!</h1>
    <p style="${PARA}">Thanks for joining. You're one step away from booking your first event.</p>
    <p style="${PARA_BUTTON}">Please confirm your email address to activate your membership:</p>
    <p style="${PARA_BUTTON}"><a href="${opts.verifyUrl}" style="${BUTTON}">Confirm my email</a></p>
    <p style="${PARA}">Once confirmed, you can browse and book events straight away.</p>
    <p style="${PARA}">The FastMatch Team</p>
  `);

  return { subject: 'Confirm your FastMatch membership', html };
}

/**
 * A fresh confirmation link for a member who already has an account but never
 * confirmed their address (asked for from My Account or the confirm page).
 * Not "Welcome… thanks for joining": they joined a while ago.
 */
export function confirmEmailAgainEmail(opts: { memberName: string; verifyUrl: string }) {
  const html = emailLayout(`
    <h1 style="${EMAIL_HEADING}">Confirm your email address</h1>
    <p style="${PARA_BUTTON}">Hi ${escapeHtml(opts.memberName)}, here's a new link to confirm the email address on your FastMatch account:</p>
    <p style="${PARA_BUTTON}"><a href="${opts.verifyUrl}" style="${BUTTON}">Confirm my email</a></p>
    <p style="${PARA}">It works for 7 days. Once your email and mobile are both confirmed, you can book events.</p>
    <p style="${PARA}">The FastMatch Team</p>
  `);
  return { subject: 'Confirm your FastMatch email address', html };
}
