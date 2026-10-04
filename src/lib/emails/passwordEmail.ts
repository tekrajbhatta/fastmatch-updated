import { emailLayout } from './layout';
import { BRAND_COLORS } from '../brand';
import { escapeHtml } from '../escapeHtml';

// Inline styles only — email clients ignore <style>. Same values as
// welcomeEmail.ts so the family reads as one.
const HEADING = `margin:0 0 20px;font-family:Arial,sans-serif;font-size:20px;line-height:1.4;font-weight:bold;color:${BRAND_COLORS.plum};`;
const PARA = 'margin:0 0 16px;';
const PARA_BUTTON = 'margin:0 0 24px;';
const BUTTON =
  `background:${BRAND_COLORS.redCta};color:#fff;padding:12px 24px;border-radius:8px;` +
  'text-decoration:none;display:inline-block;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;';

/** "Forgot password" — a one-off link to choose a new password. */
export function passwordResetEmail(opts: { memberName: string; resetUrl: string; validMinutes: number }) {
  const html = emailLayout(`
    <h1 style="${HEADING}">Reset your password</h1>
    <p style="${PARA}">Hi ${escapeHtml(opts.memberName)},</p>
    <p style="${PARA_BUTTON}">We received a request to reset the password for your FastMatch account. Choose a new one here:</p>
    <p style="${PARA_BUTTON}"><a href="${opts.resetUrl}" style="${BUTTON}">Choose a new password</a></p>
    <p style="${PARA}">This link works for ${opts.validMinutes} minutes. If it has expired, just ask for another from the login page.</p>
    <p style="${PARA}">Didn't ask for this? You can ignore this email. Your password stays as it is.</p>
    <p style="${PARA}">The FastMatch Team</p>
  `);
  return { subject: 'Reset your FastMatch password', html };
}
