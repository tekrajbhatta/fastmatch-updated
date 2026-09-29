import { EVENT_TIME_ZONE } from './datetime';

/**
 * Which timezone to show a member their event times in.
 *
 * Gil's rule: every member — and every friend booked in by one — sees times
 * in their own timezone, based on the location (City) they're registered
 * with. The site itself already does this, because browsers show times in the
 * visitor's own zone; emails and SMS are written on the server, so they need
 * telling. Without this they used the server's clock (UTC in production), so
 * a 7:30pm Sydney event read "9:30am".
 *
 * Keyed by City name — the site's list of cities is fixed (prisma/seed.ts).
 * Anything unrecognised falls back to EVENT_TIME_ZONE (Sydney), the same
 * default every time on the site used before this existed.
 */
const CITY_TIME_ZONES: Record<string, string> = {
  Sydney: 'Australia/Sydney',
  Newcastle: 'Australia/Sydney',
  'Central Coast': 'Australia/Sydney',
  Wollongong: 'Australia/Sydney',
  Canberra: 'Australia/Sydney',
  Melbourne: 'Australia/Melbourne',
  Brisbane: 'Australia/Brisbane', // no daylight saving
  'Gold Coast': 'Australia/Brisbane', // follows Queensland, not NSW
  Adelaide: 'Australia/Adelaide',
  Perth: 'Australia/Perth',
  Fremantle: 'Australia/Perth',
  Hobart: 'Australia/Hobart',
  Darwin: 'Australia/Darwin',
};

export function timeZoneForCity(cityName: string | null | undefined): string {
  return (cityName && CITY_TIME_ZONES[cityName.trim()]) || EVENT_TIME_ZONE;
}

/**
 * Event times are always shown in the EVENT's own local time — a Perth event
 * at 7:30pm reads 7:30pm, whoever is looking (Gil). When the reader is
 * somewhere the clock reads differently, the time carries a short note so
 * they don't take it as their own time: "7:30pm (Perth time)".
 *
 * Returns that note, e.g. "Perth time", or null when both clocks show the
 * same thing at that moment (Sydney and Melbourne never need one, and nor
 * does Brisbane in winter).
 */
export function zoneNote(at: Date, eventTimeZone: string, readerTimeZone: string, eventCityName: string): string | null {
  const read = (timeZone: string) =>
    new Intl.DateTimeFormat('en-AU', { day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone }).format(at);
  return read(eventTimeZone) === read(readerTimeZone) ? null : `${eventCityName} time`;
}

/** An event's time for one reader (by the city they're registered in): the zone to show it in, and any note. */
export function eventTimeFor(startsAt: Date, eventCityName: string, readerCityName: string | null | undefined) {
  const timeZone = timeZoneForCity(eventCityName);
  return { timeZone, zoneNote: zoneNote(startsAt, timeZone, timeZoneForCity(readerCityName), eventCityName) };
}

/**
 * The same, for the website: the reader is whoever is looking, in their
 * browser's timezone. Browser-only (reads the viewer's clock settings).
 */
export function formatEventForViewer(startsAt: string | Date, eventCityName: string) {
  const at = new Date(startsAt);
  const timeZone = timeZoneForCity(eventCityName);
  const viewer = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    /** "Wed, 30 Sept" */
    shortDate: at.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone }),
    /** "Wednesday 30 September" */
    longDate: at.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone }),
    /** "Wed, 30 Sept 2026" */
    dateWithYear: at.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone }),
    /** "7:30 pm" */
    time: at.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone }),
    /** "Perth time", or null */
    note: zoneNote(at, timeZone, viewer, eventCityName),
  };
}

/** The instant a calendar day ("2026-09-01") starts in a timezone — for date filters. */
export function startOfDayIn(ymd: string, timeZone: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  // Offset of that zone around then, e.g. "GMT+10:00".
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(new Date(utcMidnight))
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  const offsetMin = match ? (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
  return new Date(utcMidnight - offsetMin * 60_000);
}

/** "2026-09" and "September 2026" for an instant, in a timezone. */
export function monthIn(at: Date, timeZone: string): { key: string; label: string } {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(at);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  return { key: `${y}-${m}`, label: at.toLocaleDateString('en-AU', { timeZone, month: 'long', year: 'numeric' }) };
}
