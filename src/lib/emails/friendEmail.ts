import { emailLayout } from './layout';
import { BRAND_COLORS } from '../brand';
import { formatEventWhen } from '../datetime';

// Inline styles only — email clients ignore <style>. Same values as
// welcomeEmail.ts so the two read as one family.
const HEADING = `margin:0 0 20px;font-family:Arial,sans-serif;font-size:20px;line-height:1.4;font-weight:bold;color:${BRAND_COLORS.plum};`;
const PARA = 'margin:0 0 16px;';
const PARA_BUTTON = 'margin:0 0 24px;';
const BUTTON =
  `background:${BRAND_COLORS.redCta};color:#fff;padding:12px 24px;border-radius:8px;` +
  'text-decoration:none;display:inline-block;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;';

/**
 * To a friend a member booked in who has no password yet: they've been added
 * to FastMatch, here's their booking, and here's how to set a password — which
 * they need to check in on the night and choose their matches afterwards.
 */
export function friendWelcomeEmail(opts: {
  friendName: string;
  bookedByName: string;
  eventName: string;
  venue: string;
  startsAt: Date;
  /** The EVENT's timezone. */
  timeZone: string;
  /** "Perth time" when the friend's own clock reads differently. */
  zoneNote?: string | null;
  setPasswordUrl: string;
  checkInUrl: string;
}) {
  const html = emailLayout(`
    <h1 style="${HEADING}">You're booked in, ${opts.friendName}!</h1>
    <p style="${PARA}">${opts.bookedByName} has booked you into <strong>${opts.eventName}</strong> at ${opts.venue}.</p>
    <p style="${PARA}"><strong>${formatEventWhen(opts.startsAt, opts.timeZone)}${opts.zoneNote ? ` (${opts.zoneNote})` : ''}</strong></p>
    <p style="${PARA}">You've been added to FastMatch with this email address. Set a password so you can
      check in on the night and choose your matches afterwards:</p>
    <p style="${PARA_BUTTON}"><a href="${opts.setPasswordUrl}" style="${BUTTON}">Set your password</a></p>
    <p style="${PARA}">On the night, log in and use this link (or scan the QR code at the venue) to check in:<br>
      <a href="${opts.checkInUrl}">${opts.checkInUrl}</a></p>
    <p style="${PARA}">Can't make it, or not expecting this? Let us know at
      <a href="mailto:gil@fastmatch.com.au">gil@fastmatch.com.au</a>.</p>
    <p style="${PARA}">See you there!<br>The FastMatch Team</p>
  `);
  return { subject: `${opts.bookedByName} has booked you into FastMatch speed dating`, html };
}

/**
 * "Tell A Friend": a member has registered this person with FastMatch. Says
 * who, and asks them to set a password and complete their profile. Nothing
 * else is sent to them — no blasts — unless they accept and opt in.
 */
export function tellAFriendEmail(opts: { friendName: string; inviterName: string; setPasswordUrl: string }) {
  const html = emailLayout(`
    <h1 style="${HEADING}">Hi ${opts.friendName}, you've been invited to FastMatch!</h1>
    <p style="${PARA}"><strong>${opts.inviterName}</strong> has registered you with FastMatch — Australia's original
      speed dating organiser, connecting people face to face since 1999.</p>
    <p style="${PARA}">Your account is ready. Set your password and fill in your profile details to see our upcoming
      events and book your place:</p>
    <p style="${PARA_BUTTON}"><a href="${opts.setPasswordUrl}" style="${BUTTON}">Set your password</a></p>
    <p style="${PARA}">Not interested? Just ignore this email — we won't contact you again unless you complete your registration.</p>
    <p style="${PARA}">The FastMatch Team</p>
  `);
  return { subject: `${opts.inviterName} has registered you with FastMatch`, html };
}
