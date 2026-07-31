import { emailLayout } from './layout';

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

export function eventChangeEmail(opts: {
  memberName: string;
  eventName: string;
  oldStartsAt: Date;
  newStartsAt: Date;
}) {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });

  const html = emailLayout(`
    <h1 style="color:#3D1E6D;">Change to your FastMatch event</h1>
    <p>Hi ${opts.memberName},</p>
    <p>Sorry to have to do this, but there's been an unavoidable change to the event
      <strong>${fmt(opts.oldStartsAt)}</strong> which you're currently booked into.</p>
    <p>The new time and date is:</p>
    <p><strong>${fmt(opts.newStartsAt)}</strong></p>
    <p>Sorry again, and thank you for your understanding. If this new time doesn't work for you,
      please email us at <a href="mailto:gil@fastmatch.com.au">gil@fastmatch.com.au</a>.</p>
    <p>See you there!</p>
    <p>The FastMatch Team</p>
  `);

  return { subject: `Change to your event: ${opts.eventName}`, html };
}

export function eventChangeSms(opts: { eventName: string; newStartsAt: Date }) {
  const fmt = opts.newStartsAt.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) +
    ', ' + opts.newStartsAt.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  return `FastMatch: ${opts.eventName} has changed to ${fmt}. Details: gil@fastmatch.com.au`;
}
