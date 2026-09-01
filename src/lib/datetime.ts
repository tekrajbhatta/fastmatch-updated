/**
 * Conversion between a stored UTC timestamp and the value an
 * `<input type="datetime-local">` expects.
 *
 * WHY THIS EXISTS — two real bugs it fixes:
 *
 * 1. The edit form used `event.startsAt.slice(0, 16)` to fill the input. That
 *    takes the first 16 characters of a UTC ISO string ("2026-09-17T09:00")
 *    and hands them to an input that interprets them as LOCAL time. An event
 *    at 7pm Sydney was shown to the admin as 9am. Saving then re-parsed that
 *    as 9am local and stored 23:00 UTC the previous day — every save silently
 *    moved the event by the timezone offset.
 *
 * 2. Because the saved timestamp differed from the stored one on EVERY save,
 *    the "did startsAt change?" test in the event PATCH route was always true.
 *    That is why editing an unrelated field — adding $100 of expenses — texted
 *    every confirmed attendee that the event had been rescheduled.
 *
 * The create form had the mirror problem: it posted the naive string straight
 * to the API, where `new Date("2026-09-17T19:00")` parses in the SERVER's
 * timezone, not the admin's. Both forms now go through here.
 */

/**
 * Timezone events are described in.
 *
 * Anything formatted on the SERVER — the event-change SMS and email, the
 * Stripe payment page description — would otherwise use the server's own
 * timezone. The production droplet runs UTC, so a 7:00pm Sydney event would
 * be texted to attendees as 9:00am. Formatting is pinned here instead.
 *
 * LIMITATION: one timezone for the whole site. Every venue in the directory
 * is currently in Sydney, so this is correct today, but a Perth event would
 * be described in Sydney time. Fixing that properly means storing a timezone
 * per City — worth doing before the first interstate event, not before.
 */
export const EVENT_TIME_ZONE = process.env.EVENT_TIME_ZONE || 'Australia/Sydney';

/**
 * "Thu 25 Sep 2025 at 8:00pm" — the one event date/time format used by the
 * change SMS, the change email and the Stripe payment page, so they can't
 * disagree with each other.
 */
export function formatEventWhen(d: Date): string {
  // en-AU renders "Tue, 23 Sept 2025"; the comma reads badly mid-sentence in
  // "...on Tue, 23 Sept 2025 at 7:20pm has now been changed to...", and it
  // costs a character in a message already spanning two SMS segments.
  const date = d
    .toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: EVENT_TIME_ZONE,
    })
    .replace(',', '');
  const time = d
    .toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: EVENT_TIME_ZONE })
    .replace(/\s?(am|pm)/i, (m) => m.trim().toLowerCase());
  return `${date} at ${time}`;
}

/** Stored UTC ISO -> "YYYY-MM-DDTHH:mm" in the viewer's local time. */
export function toDateTimeLocalValue(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  // Local getters on purpose — getFullYear/getMonth/... are the viewer's
  // clock, which is what the input displays.
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * "YYYY-MM-DDTHH:mm" from the input -> UTC ISO for the API.
 *
 * `new Date(naiveString)` parses as local time, which is correct HERE because
 * the string came from a local-time input in the same browser. The same
 * expression on the server would parse in the server's timezone instead —
 * which is exactly the create-form bug — so the conversion must happen
 * client-side, before the value is sent.
 */
export function fromDateTimeLocalValue(local: string): string {
  return new Date(local).toISOString();
}
