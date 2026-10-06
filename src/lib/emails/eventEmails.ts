import { emailLayout, EMAIL_HEADING, EMAIL_SUBHEADING } from './layout';
import { BRAND_COLORS } from '../brand';
import { formatEventShort, EVENT_TIME_ZONE } from '../datetime';
import { escapeHtml, oneLine } from '../escapeHtml';
import { registeredAccountHtml, type RegisteredLinks } from './signupEmails';
import { formatPrice } from '../price';

// Names (member, event, venue, city) are typed by members and admins, so each
// is escaped where it goes into the HTML, and kept to one line in a subject.
// An event is named by its type and name, "Speed dating, 28-40 years"
// (eventLabel, src/lib/eventLabel.ts): that's what the eventName options take.

const CHECK_IN_BUTTON = `background:${BRAND_COLORS.redCta};color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;`;

/**
 * What to do on the night, step by step, with the check-in button — in the
 * booking, friend-booking and reminder emails. It used to be one line ("On
 * the night, show this link (or the QR code at the venue) to check yourself
 * in"), which Gil found unclear. Check-in opens an hour before the start and
 * closes at midnight (src/lib/eventNight.ts).
 */
export function checkInStepsHtml(checkInUrl: string): string {
  return `
    <h2 style="${EMAIL_SUBHEADING}color:${BRAND_COLORS.plum};">How to check in on the night</h2>
    <ol style="margin:0 0 16px;padding-left:22px;">
      <li style="margin:0 0 8px;">When you arrive at the venue, tap <strong>Check in</strong> below on your phone, or scan the QR code at the venue. Check-in opens an hour before the start.</li>
      <li style="margin:0 0 8px;">Log in if you're asked to, check your details and tap <strong>Confirm &amp; check in</strong>. You'll see your number for the night.</li>
      <li style="margin:0 0 8px;">After you meet each person, tap their name and choose <strong>Date</strong>, <strong>Friend</strong> or <strong>No</strong>. Then tap <strong>Submit matches</strong> before midnight.</li>
    </ol>
    <p style="margin:0 0 16px;"><a href="${checkInUrl}" style="${CHECK_IN_BUTTON}">Check in</a></p>
    <p>Your matches are emailed to you after midnight, and shown on your My Match History page.</p>
  `;
}

/**
 * "You're booked in!" With `registered` — someone the admin has just added
 * at an event — it also says FastMatch has registered them: log in with the
 * password they were given, or choose their own. One email, not two (the
 * user, 6 Oct).
 */
export function bookingConfirmationEmail(opts: {
  memberName: string;
  /** Type and name: eventLabel(). */
  eventName: string;
  venue: string;
  startsAt: Date;
  checkInUrl: string;
  /** The EVENT's timezone — times are always the event's local time. */
  timeZone: string;
  /** "Perth time" when the recipient's own clock reads differently — see zoneNote. */
  zoneNote?: string | null;
  registered?: RegisteredLinks;
}) {
  const dateStr = opts.startsAt.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: opts.timeZone,
  });
  const timeStr =
    opts.startsAt.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: opts.timeZone }) +
    (opts.zoneNote ? ` (${escapeHtml(opts.zoneNote)})` : '');

  const html = emailLayout(`
    <h1 style="${EMAIL_HEADING}">${opts.registered ? "You're registered and booked in!" : "You're booked in!"}</h1>
    <p>Hi ${escapeHtml(opts.memberName)},</p>
    <p>You're confirmed for <strong>${escapeHtml(opts.eventName)}</strong> at ${escapeHtml(opts.venue)}.</p>
    <p><strong>${dateStr}</strong><br>${timeStr}</p>
    ${opts.registered ? `<h2 style="${EMAIL_SUBHEADING}color:${BRAND_COLORS.plum};">Your FastMatch account</h2>${registeredAccountHtml(opts.registered)}` : ''}
    ${checkInStepsHtml(opts.checkInUrl)}
    <p>If for whatever reason you can't make it, please let us know as soon as you can at
      <a href="mailto:gil@fastmatch.com.au">gil@fastmatch.com.au</a>.</p>
    <p>See you there!</p>
    <p>The FastMatch Team</p>
  `);

  const subject = opts.registered ? `You're registered with FastMatch and booked: ${oneLine(opts.eventName)}` : `You're booked: ${oneLine(opts.eventName)}`;
  return { subject, html };
}

// Tone matches the real old-system reminder ("Teo, you are Speed dating on...")
export function eventReminderEmail(opts: { memberName: string; eventName: string; startsAt: Date; venue: string; timeZone: string; zoneNote?: string | null; checkInUrl: string }) {
  const dateStr = opts.startsAt.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: opts.timeZone });
  const timeStr =
    opts.startsAt.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: opts.timeZone }) +
    (opts.zoneNote ? ` (${escapeHtml(opts.zoneNote)})` : '');

  const html = emailLayout(`
    <h1 style="${EMAIL_HEADING}">${escapeHtml(opts.memberName)}, you're speed dating on ${dateStr}!</h1>
    <p>How exciting! Your event is almost here.</p>
    <p>What to wear? Entirely up to you. Smart casual is always a safe bet. Just be yourself.</p>
    <p>There'll be plenty of first-timers there too, so relax, smile, and enjoy the process.</p>
    <p>Remember to arrive at least 10 minutes early so you're checked in and ready to go.</p>
    <p><strong>${escapeHtml(opts.eventName)}</strong><br>${escapeHtml(opts.venue)}<br>${dateStr}, ${timeStr}</p>
    ${checkInStepsHtml(opts.checkInUrl)}
    <p>Can't make it? Let us know at <a href="mailto:gil@fastmatch.com.au">gil@fastmatch.com.au</a>.</p>
    <p>See you there!</p>
    <p>The FastMatch Team</p>
  `);

  return { subject: `${oneLine(opts.memberName)}, you're speed dating on ${dateStr}!`, html };
}

/**
 * What actually changed about an event, as detected by the PATCH route.
 * Only these three things notify attendees — see the route for why.
 */
export interface EventChange {
  /** Type and name (eventLabel), for the email's subject. */
  eventName: string;
  themeName: string;
  ageMin: number;
  ageMax: number;
  oldVenue: string;
  newVenue: string;
  /** New venue with its street address, for a venue move. */
  newVenueFull: string;
  oldStartsAt: Date;
  newStartsAt: Date;
  venueChanged: boolean;
  timeChanged: boolean;
  cancelled: boolean;
  /** The EVENT's timezone; defaults to EVENT_TIME_ZONE. */
  timeZone?: string;
  /** "Perth time" when the recipient's own clock reads differently. */
  zoneNote?: string | null;
}


/**
 * The event-change SMS — Gil's approved wording, one message per case.
 *
 * Every variant opens by naming the booking the same way ("Your fastmatch
 * event on <date> at <time> at <venue>") so the recipient knows which event
 * this is about before reading what changed.
 *
 * LENGTH: all three fit inside a SINGLE SMS (160 chars GSM-7). The earlier,
 * longer version ran to two segments and doubled the per-recipient cost.
 * There is a test pinning this — if a venue name is long enough to push a
 * message over, the test is the thing that should be reconsidered, not
 * silently raised.
 */
export function eventChangeSms(c: EventChange): string {
  // The note goes once, after the first time — every time in the message is
  // in the same zone, and it keeps a cross-city message as short as possible.
  const note = c.zoneNote ? ` (${c.zoneNote})` : '';
  const from = `Your fastmatch event on ${formatEventShort(c.oldStartsAt, c.timeZone)}${note} at ${c.oldVenue}`;
  // Gil doesn't want replies to the number, so every event-change message
  // carries his address instead. Note the cancellation dropped "We will
  // contact you shortly by email" when this was added: with the address
  // right there it was redundant, and keeping it pushed the message to 162
  // characters — two over the single-SMS limit, doubling the cost of exactly
  // the message you least want to skimp on.
  const contact = 'gil@fastmatch.com.au';

  if (c.cancelled) {
    return `${from} has been cancelled. Sorry for the inconvenience. ${contact}`;
  }

  // A venue move names the NEW venue with its street address — the recipient
  // is going somewhere they may not know. A time-only change doesn't repeat
  // the address, since they already know where it is.
  if (c.venueChanged) {
    return `${from} has been moved to ${formatEventShort(c.newStartsAt, c.timeZone)} at ${c.newVenueFull}. ${contact}`;
  }

  return `${from} has been changed to ${formatEventShort(c.newStartsAt, c.timeZone)} at ${c.newVenue}. ${contact}`;
}

/**
 * `refunded`: what their card was refunded when the event was cancelled
 * (src/lib/cancelEvent.ts), said in the cancellation email. Not in the text
 * message, which stays one SMS.
 */
export function eventChangeEmail(c: EventChange & { memberName: string; refunded?: number | null }) {
  const timeZone = c.timeZone ?? EVENT_TIME_ZONE;
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone }) +
    ', ' +
    d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone }) +
    (c.zoneNote ? ` (${escapeHtml(c.zoneNote)})` : '');

  const P = 'margin:0 0 16px;';

  if (c.cancelled) {
    return {
      subject: `Cancelled: ${oneLine(c.eventName)}`,
      html: emailLayout(`
        <h1 style="${EMAIL_HEADING}">Your FastMatch event has been cancelled</h1>
        <p style="${P}">Hi ${escapeHtml(c.memberName)},</p>
        <p style="${P}">We're sorry to let you know that <strong>${escapeHtml(c.oldVenue)} ${escapeHtml(c.themeName)} ${c.ageMin}-${c.ageMax} years</strong>
          on <strong>${fmt(c.oldStartsAt)}</strong>, which you were booked into, has been cancelled.</p>
        ${c.refunded ? `<p style="${P}">Your payment of <strong>${formatPrice(c.refunded)}</strong> has been refunded to your card. Depending on your bank, it can take 5 to 10 business days to show.</p>` : ''}
        <p style="${P}">If any issues please contact
          <a href="mailto:gil@fastmatch.com.au">gil@fastmatch.com.au</a>.</p>
        <p style="${P}">The FastMatch Team</p>
      `),
    };
  }

  const changes: string[] = [];
  if (c.venueChanged) changes.push(`<p style="${P}"><strong>Venue:</strong> ${escapeHtml(c.oldVenue)} &rarr; <strong>${escapeHtml(c.newVenue)}</strong></p>`);
  if (c.timeChanged) changes.push(`<p style="${P}"><strong>When:</strong> ${fmt(c.oldStartsAt)} &rarr; <strong>${fmt(c.newStartsAt)}</strong></p>`);

  const html = emailLayout(`
    <h1 style="${EMAIL_HEADING}">Change to your FastMatch event</h1>
    <p style="${P}">Hi ${escapeHtml(c.memberName)},</p>
    <p style="${P}">There's been a change to <strong>${escapeHtml(c.oldVenue)} ${escapeHtml(c.themeName)} ${c.ageMin}-${c.ageMax} years</strong>,
      which you're booked into:</p>
    ${changes.join('')}
    <p style="${P}">Sorry for the inconvenience. If this doesn't work for you, please email
      <a href="mailto:gil@fastmatch.com.au">gil@fastmatch.com.au</a>.</p>
    <p style="${P}">See you there!</p>
    <p style="${P}">The FastMatch Team</p>
  `);

  return { subject: `Change to your event: ${oneLine(c.eventName)}`, html };
}
