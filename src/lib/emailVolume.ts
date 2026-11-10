import { hitRateLimit, HOUR } from './rateLimit';
import { sendEmail } from './emails/send';
import { emailLayout } from './emails/layout';

/**
 * A ceiling on emails the site sends to addresses that visitors type in
 * (password resets, sign-up confirmations, Tell A Friend invitations), across
 * the whole site. Per-address and per-visitor limits stop one person flooding
 * one inbox; this stops many machines at once using the site to send mail in
 * bulk, which could get the sending domain blocked and stop every FastMatch
 * email, booking confirmations included.
 *
 * Generous on purpose: after Gil's first blast to the imported members,
 * thousands may reset their password within an hour. Gil is emailed once an
 * hour when it gets busy (ALERT_AT), so a real attack is noticed early; only
 * past the hard ceiling are these emails held back (the visitor sees the
 * usual reply, as for any other limit).
 */
export const SITE_EMAILS_PER_HOUR = 3000;
export const ALERT_AT = 500;
const ADMIN_EMAIL = 'gil@fastmatch.com.au';

export type TypedAddressEmail = 'reset' | 'signup' | 'invite';

/** Counts one email of this kind; false when the site-wide ceiling for the hour is reached (send nothing then). */
export async function allowSiteEmail(kind: TypedAddressEmail): Promise<boolean> {
  const hit = await hitRateLimit('site-emails:typed-addresses', SITE_EMAILS_PER_HOUR, HOUR);
  if (hit.count >= ALERT_AT || !hit.allowed) {
    // At most one alert an hour, however many emails go past the line.
    const alert = await hitRateLimit('site-emails:alerted', 1, HOUR);
    if (alert.allowed) void alertBusy(hit.count, !hit.allowed, kind);
  }
  if (!hit.allowed) console.error(`Site-wide email ceiling reached: a ${kind} email was held back.`);
  return hit.allowed;
}

async function alertBusy(count: number, ceilingReached: boolean, kind: TypedAddressEmail): Promise<void> {
  console.error(`Site emails to typed addresses: ${count} in the last hour${ceilingReached ? ' (ceiling reached)' : ''}.`);
  try {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: ceilingReached
        ? 'FastMatch: password reset and sign-up emails are being held back'
        : 'FastMatch: unusually many password reset and sign-up emails',
      html: emailLayout(`
        <p style="margin:0 0 16px;">In the last hour the site has sent about ${count} password reset, sign-up and invitation emails (the latest: ${kind === 'reset' ? 'a password reset' : kind === 'signup' ? 'a sign-up confirmation' : 'a Tell A Friend invitation'}).</p>
        <p style="margin:0 0 16px;">${ceilingReached
          ? `That is the most the site sends in an hour (${SITE_EMAILS_PER_HOUR}), so more of these emails are being held back until the hour is up. If you have just sent a blast asking members to reset their password, this is expected and it will clear by itself. If not, someone may be using the forms to send mail in bulk; please let your developer know.`
          : `That's more than usual. If you have just sent a blast asking members to reset their password, this is expected. If not, someone may be using the forms to send mail in bulk; please let your developer know.`}</p>
        <p style="margin:0 0 16px;">You'll get at most one of these emails an hour.</p>
      `),
    });
  } catch (err) {
    console.error('Could not email the busy-site alert', err);
  }
}
