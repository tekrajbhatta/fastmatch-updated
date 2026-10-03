/**
 * Wall-clock time in a named timezone <-> the exact moment it refers to.
 *
 * An event is entered and shown in its CITY's local time: 7:00 pm in Perth
 * is 7:00 pm on Perth clocks, whoever is looking and wherever the server is.
 * The browser's own Date methods only know the device's timezone, and the
 * server's only the server's, so anything that reads or writes "7:00 pm in
 * Perth" goes through here instead.
 *
 * Built on the Intl API only (no library): it knows every timezone and its
 * daylight-saving rules, in browsers and in Node alike. Safe to import from
 * client components.
 *
 * Formats used throughout:
 *   wall time  "2026-10-09T19:00"  what an <input type="datetime-local"> holds
 *   date       "2026-10-09"        what an <input type="date"> holds
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

// Building an Intl.DateTimeFormat is slow; one per timezone is plenty.
const formatters = new Map<string, Intl.DateTimeFormat>();

function clockIn(at: number, timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  const p: Record<string, number> = {};
  for (const { type, value } of f.formatToParts(at)) if (type !== 'literal') p[type] = Number(value);
  return { year: p.year, month: p.month, day: p.day, hour: p.hour === 24 ? 0 : p.hour, minute: p.minute, second: p.second };
}

/** How far a timezone's clocks are ahead of UTC at a moment, in milliseconds. */
function offsetAt(at: number, timeZone: string): number {
  const c = clockIn(at, timeZone);
  return Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second) - Math.floor(at / 1000) * 1000;
}

/** What the clocks in `timeZone` read at a moment: "2026-10-09T19:00". Empty for an invalid date. */
export function wallTimeIn(at: Date | string, timeZone: string): string {
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return '';
  const c = clockIn(t, timeZone);
  return `${c.year}-${pad(c.month)}-${pad(c.day)}T${pad(c.hour)}:${pad(c.minute)}`;
}

/** The calendar day in `timeZone` at a moment: "2026-10-09". Empty for an invalid date. */
export function dateIn(at: Date | string, timeZone: string): string {
  return wallTimeIn(at, timeZone).slice(0, 10);
}

/**
 * The moment the clocks in `timeZone` show a wall time ("2026-10-09T19:00",
 * or a bare date for midnight). An Invalid Date for anything malformed or
 * impossible (30 February, 25:00).
 *
 * Daylight saving, the same way browsers resolve it:
 *   - a time skipped when clocks go forward moves forward by the gap
 *     (2:30 am on that Sunday is 3:30 am);
 *   - a time that happens twice when clocks go back is the first one.
 */
export function instantFromWallTime(wall: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(wall.trim());
  if (!m) return new Date(NaN);
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4] ?? '00', m[5] ?? '00'].map(Number);
  if (h > 23 || mi > 59) return new Date(NaN);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(asUtc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return new Date(NaN);

  const wanted = `${m[1]}-${m[2]}-${m[3]}T${pad(h)}:${pad(mi)}`;
  // The offset either side of any clock change near this time. Real
  // timezones never change twice within two days.
  const before = offsetAt(asUtc - DAY_MS, timeZone);
  const after = offsetAt(asUtc + DAY_MS, timeZone);
  const matches = [asUtc - before, asUtc - after]
    .filter((t) => wallTimeIn(new Date(t), timeZone) === wanted)
    .sort((a, b) => a - b);
  // No match: the time was skipped. Reading it with the earlier offset lands
  // the same distance past the change.
  return new Date(matches.length ? matches[0] : asUtc - before);
}

/** "2026-10-09" plus a number of days (negative to go back). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/**
 * "2026-01-31" plus a number of months, keeping the day of the month. A month
 * that's too short gets its last day instead (31 January + 1 month is
 * 28 February, then 31 March): never spilling into the month after.
 */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(d, lastDay))}`;
}

/** The first moment of a calendar day in `timeZone`. */
export function startOfDayIn(date: string, timeZone: string): Date {
  return instantFromWallTime(`${date}T00:00`, timeZone);
}

/** The last moment (to the millisecond) of a calendar day in `timeZone`. */
export function endOfDayIn(date: string, timeZone: string): Date {
  const next = startOfDayIn(addDays(date, 1), timeZone);
  return new Date(next.getTime() - 1);
}
