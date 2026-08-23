import { emailLayout } from './layout';
import { BRAND_COLORS } from '../brand';

// Email clients ignore <style> blocks and external stylesheets, so every rule
// has to be inline. The heading in particular needs its font stack and size
// restated: Gmail and Outlook apply their own <h1> defaults, so an unstyled
// <h1> renders oversized and in a different typeface to the body copy.
// 20px matches the campaign template's heading.
const HEADING = `margin:0 0 20px;font-family:Arial,sans-serif;font-size:20px;line-height:1.4;font-weight:bold;color:${BRAND_COLORS.plum};`;

// Explicit paragraph margins — several clients zero out the default <p>
// margin, which runs every line together into one block.
const PARA = 'margin:0 0 16px;';
const PARA_BUTTON = 'margin:0 0 24px;';

const BUTTON =
  `background:${BRAND_COLORS.redCta};color:#fff;padding:12px 24px;border-radius:8px;` +
  'text-decoration:none;display:inline-block;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;';

export function welcomeVerificationEmail(opts: { memberName: string; verifyUrl: string }) {
  const html = emailLayout(`
    <h1 style="${HEADING}">Welcome to FastMatch, ${opts.memberName}!</h1>
    <p style="${PARA}">Thanks for joining — you're one step away from booking your first event.</p>
    <p style="${PARA_BUTTON}">Please confirm your email address to activate your membership:</p>
    <p style="${PARA_BUTTON}"><a href="${opts.verifyUrl}" style="${BUTTON}">Confirm my email</a></p>
    <p style="${PARA}">Once confirmed, you can browse and book events straight away.</p>
    <p style="${PARA}">The FastMatch Team</p>
  `);

  return { subject: 'Confirm your FastMatch membership', html };
}
