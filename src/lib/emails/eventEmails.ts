import { emailLayout } from './layout';
import { formatEventWhen } from '../datetime';

export function bookingConfirmationEmail(opts: {
  memberName: string;
  eventName: string;
  venue: string;
  startsAt: Date;
  checkInUrl: string;
}) {
  const dateStr = opts.startsAt.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const timeStr = opts.startsAt.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });

  const html = emailLayout(`
    <h1 style="color:#3D1E6D;">You're booked in!</h1>
    <p>Hi ${opts.memberName},</p>
    <p>You're confirmed for <strong>${opts.eventName}</strong> at ${opts.venue}.</p>
    <p><strong>${dateStr}</strong><br>${timeStr}</p>
    <p>On the night, show this link (or the QR code at the venue) to check yourself in:</p>
    <p><a href="${opts.checkInUrl}" style="background:#E1382E;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Check in on the night</a></p>
    <p>If for whatever reason you can't make it, please let us know as soon as you can at
      <a href="mailto:gil@fastmatch.com.au">gil@fastmatch.com.au</a>.</p>
    <p>See you there!</p>
    <p>The FastMatch Team</p>
  `);

  return { subject: `You're booked: ${opts.eventName}`, html };
}

// Tone matches the real old-system reminder ("Teo, you are Speed dating on...")
export function eventReminderEmail(opts: { memberName: string; eventName: string; startsAt: Date; venue: string }) {
  const dateStr = opts.startsAt.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeStr = opts.startsAt.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });

  const html = emailLayout(`
    <h1 style="color:#3D1E6D;">${opts.memberName}, you're speed dating on ${dateStr}!</h1>
    <p>How exciting — your event is almost here.</p>
    <p>What to wear? Entirely up to you — smart casual is always a safe bet. Just be yourself.</p>
    <p>There'll be plenty of first-timers there too, so relax, smile, and enjoy the process.</p>
    <p>Remember to arrive at least 10 minutes early so you're checked in and ready to go.</p>
    <p><strong>${opts.eventName}</strong><br>${opts.venue}<br>${dateStr}, ${timeStr}</p>
    <p>Can't make it? Let us know at <a href="mailto:gil@fastmatch.com.au">gil@fastmatch.com.au</a>.</p>
    <p>See you there!</p>
    <p>The FastMatch Team</p>
  `);

  return { subject: `${opts.memberName}, you're speed dating on ${dateStr}!`, html };
}

/**
 * What actually changed about an event, as detected by the PATCH route.
 * Only these three things notify attendees — see the route for why.
 */
export interface EventChange {
  eventName: string;
  themeName: string;
  ageMin: number;
  ageMax: number;
  oldVenue: string;
  newVenue: string;
  oldStartsAt: Date;
  newStartsAt: Date;
  venueChanged: boolean;
  timeChanged: boolean;
  cancelled: boolean;
}


/**
 * The event-change SMS.
 *
 * Names the event in full — venue, theme, age range and the ORIGINAL date and
 * time — so the recipient knows which booking this is about, then states only
 * what actually changed. Gil's requested shape:
 *
 *   "Soultrap Bar professional speed dating 28-40 years on Tue 23 Sep 2025 at
 *    7:20pm has now been changed to GG Bar on Thu 25 Sep 2025 at 8:00pm.
 *    If any issues please contact gil@fastmatch.com.au"
 *
 * LENGTH: this is deliberately detailed and will run to 2-3 SMS segments
 * (160 chars for one, then 153 each). Cellcast bills per segment, so a change
 * to a full 24-person event costs roughly 2-3 credits per attendee.
 */
export function eventChangeSms(c: EventChange): string {
  const subject = `${c.oldVenue} ${c.themeName} ${c.ageMin}-${c.ageMax} years on ${formatEventWhen(c.oldStartsAt)}`;
  const contact = 'If any issues please contact gil@fastmatch.com.au';

  if (c.cancelled) {
    return `${subject} has been CANCELLED. ${contact}`;
  }

  // Only mention the parts that moved: saying "changed to <same venue>" when
  // only the time moved reads like a mistake.
  const parts: string[] = [];
  if (c.venueChanged) parts.push(c.newVenue);
  if (c.timeChanged) parts.push(formatEventWhen(c.newStartsAt));

  return `${subject} has now been changed to ${parts.join(' on ')}. ${contact}`;
}

export function eventChangeEmail(c: EventChange & { memberName: string }) {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });

  const P = 'margin:0 0 16px;';

  if (c.cancelled) {
    return {
      subject: `Cancelled: ${c.eventName}`,
      html: emailLayout(`
        <h1 style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:20px;line-height:1.4;font-weight:bold;color:#3D1E6D;">Your FastMatch event has been cancelled</h1>
        <p style="${P}">Hi ${c.memberName},</p>
        <p style="${P}">Sorry — <strong>${c.oldVenue} ${c.themeName} ${c.ageMin}-${c.ageMax} years</strong>
          on <strong>${fmt(c.oldStartsAt)}</strong>, which you were booked into, has been cancelled.</p>
        <p style="${P}">If any issues please contact
          <a href="mailto:gil@fastmatch.com.au">gil@fastmatch.com.au</a>.</p>
        <p style="${P}">The FastMatch Team</p>
      `),
    };
  }

  const changes: string[] = [];
  if (c.venueChanged) changes.push(`<p style="${P}"><strong>Venue:</strong> ${c.oldVenue} &rarr; <strong>${c.newVenue}</strong></p>`);
  if (c.timeChanged) changes.push(`<p style="${P}"><strong>When:</strong> ${fmt(c.oldStartsAt)} &rarr; <strong>${fmt(c.newStartsAt)}</strong></p>`);

  const html = emailLayout(`
    <h1 style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:20px;line-height:1.4;font-weight:bold;color:#3D1E6D;">Change to your FastMatch event</h1>
    <p style="${P}">Hi ${c.memberName},</p>
    <p style="${P}">There's been a change to <strong>${c.oldVenue} ${c.themeName} ${c.ageMin}-${c.ageMax} years</strong>,
      which you're booked into:</p>
    ${changes.join('')}
    <p style="${P}">Sorry for the inconvenience. If this doesn't work for you, please email
      <a href="mailto:gil@fastmatch.com.au">gil@fastmatch.com.au</a>.</p>
    <p style="${P}">See you there!</p>
    <p style="${P}">The FastMatch Team</p>
  `);

  return { subject: `Change to your event: ${c.eventName}`, html };
}
