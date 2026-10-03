import { wallTimeIn, instantFromWallTime } from './zonedTime';

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
 *
 * 3. Both conversions then used the BROWSER's timezone, so an event was
 *    entered on the admin's own clock rather than the event city's: a Perth
 *    7:00 pm entered on a Sydney computer was saved as 4:00 pm Perth time.
 *    The input now always holds the event city's clock (src/lib/zonedTime.ts),
 *    whatever device it's typed on.
 */

/**
 * Timezone events are described in.
 *
 * Anything formatted on the SERVER — the event-change SMS and email, the
 * Stripe payment page description — would otherwise use the server's own
 * timezone. The production droplet runs UTC, so a 7:00pm Sydney event would
 * be texted to attendees as 9:00am. Formatting is pinned here instead.
 *
 * This is only the DEFAULT. Anything sent to a particular member passes
 * their own zone instead (timeZoneForCity in src/lib/timezone.ts), so each
 * person reads times in the timezone of the city they registered with.
 */
export const EVENT_TIME_ZONE = process.env.EVENT_TIME_ZONE || 'Australia/Sydney';

/**
 * "Thu 25 Sep 2025 at 8:00pm" — the one event date/time format used by the
 * change SMS, the change email and the Stripe payment page, so they can't
 * disagree with each other.
 */
export function formatEventWhen(d: Date, timeZone: string = EVENT_TIME_ZONE): string {
  // en-AU renders "Tue, 23 Sept 2025"; the comma reads badly mid-sentence in
  // "...on Tue, 23 Sept 2025 at 7:20pm has now been changed to...", and it
  // costs a character in a message already spanning two SMS segments.
  const date = d
    .toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone,
    })
    .replace(',', '');
  const time = d
    .toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone })
    .replace(/\s?(am|pm)/i, (m) => m.trim().toLowerCase());
  return `${date} at ${time}`;
}

/**
 * Stored UTC ISO -> "YYYY-MM-DDTHH:mm" on the clock of `timeZone`: the event
 * city's (timeZoneForCity). Empty for an unparseable value.
 */
export function toDateTimeLocalValue(iso: string | Date, timeZone: string): string {
  return wallTimeIn(iso, timeZone);
}

/**
 * "YYYY-MM-DDTHH:mm" from the input, read on the clock of `timeZone` (the
 * event city's) -> UTC ISO for the API. Empty for anything that isn't a real
 * date and time, so the form can say so instead of sending it.
 */
export function fromDateTimeLocalValue(local: string, timeZone: string): string {
  const at = instantFromWallTime(local, timeZone);
  return Number.isNaN(at.getTime()) ? '' : at.toISOString();
}

/**
 * "23/07/26 at 7.30pm" — the compact form Gil asked for in the event-change
 * SMS. Deliberately shorter than formatEventWhen: the long form pushed the
 * message to two SMS segments, and this keeps every variant inside one.
 *
 * Note the DOT in the time ("7.30pm", not "7:30pm") — that is how Gil writes
 * it, and it is what the approved wording uses.
 */
export function formatEventShort(d: Date, timeZone: string = EVENT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-AU', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone,
  }).formatToParts(d);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
  const ampm = get('dayPeriod').toLowerCase().replace(/[^apm]/g, '');
  return `${get('day')}/${get('month')}/${get('year')} at ${get('hour')}.${get('minute')}${ampm}`;
}
