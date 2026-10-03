import { EVENT_TIME_ZONE } from './datetime';
import { dateIn, addMonths } from './zonedTime';

/*
 * Ages count whole calendar days, the same on every machine:
 *   - a date of birth is a calendar date, stored as midnight UTC
 *     ("1990-05-05T00:00:00Z"), so it's read in UTC;
 *   - "today" is today's date in Sydney, where FastMatch keeps its days.
 * Both used to be read on the device's own clock, which made a birthday
 * count from 10–11 am Sydney time on a UTC machine, and a day out in a
 * browser west of UTC.
 */

interface CalendarDate { y: number; m: number; d: number }

const calendarDate = (date: string): CalendarDate => {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
};

/** The calendar date a stored date of birth stands for. */
const birthDate = (dob: Date): CalendarDate => ({ y: dob.getUTCFullYear(), m: dob.getUTCMonth() + 1, d: dob.getUTCDate() });

/** Whole years from one calendar date to another. */
function yearsBetween(from: CalendarDate, to: CalendarDate): number {
  let years = to.y - from.y;
  if (to.m < from.m || (to.m === from.m && to.d < from.d)) years--;
  return years;
}

/** Today's date in Sydney: "2026-10-03". */
export function todayInSydney(now: Date = new Date()): string {
  return dateIn(now, EVENT_TIME_ZONE);
}

/** A "YYYY-MM-DD" date as a stored date of birth (midnight UTC). */
const storedDate = (date: string) => new Date(`${date}T00:00:00.000Z`);

// Age as of today, accounting for whether this year's birthday has
// happened yet — not just a year subtraction. Shared by registration
// (18+ check) and event booking (age-range check) so both agree on the
// same definition of "age". Someone born on 29 February is a year older
// from 1 March in other years.
export function calculateAge(dob: Date, now: Date = new Date()): number {
  return yearsBetween(birthDate(dob), calendarDate(todayInSydney(now)));
}

/**
 * The dateOfBirth range for an age range today, for database filters
 * (`dateOfBirth: { lte, gt }`), agreeing exactly with calculateAge:
 *   at least `min`  <=>  born on or before this day `min` years ago
 *   at most `max`   <=>  born after this day `max + 1` years ago
 */
export function birthDateRange(
  min: number | null | undefined,
  max: number | null | undefined,
  now: Date = new Date(),
): { lte?: Date; gt?: Date } {
  const today = todayInSydney(now);
  const range: { lte?: Date; gt?: Date } = {};
  if (min != null) range.lte = storedDate(addMonths(today, -12 * min));
  if (max != null) range.gt = storedDate(addMonths(today, -12 * (max + 1)));
  return range;
}

/** The latest date of birth that is 18 today ("YYYY-MM-DD"): the `max` for date-of-birth inputs. */
export function latestAdultDateOfBirth(now: Date = new Date()): string {
  return addMonths(todayInSydney(now), -12 * 18);
}

/**
 * How far outside an event's stated age range a member can be and still have
 * that event suggested to them on the events page.
 *
 * Gil's wording: "based on 10 years above below age range" — so a 35-year-old
 * is shown events for 25-35 and for 40-50, but not 50-65.
 */
export const AGE_SUGGESTION_MARGIN = 10;

/**
 * Whether an event should appear under "other upcoming events you may be
 * interested in" for a member of this age.
 *
 * DELIBERATELY WIDER than the booking rule. api/events/[eventId]/book enforces
 * the event's exact range (age < ageMin || age > ageMax is rejected), so some
 * suggested events will be refused at booking. That is intended: this list
 * answers "what's on that's roughly for me", not "what can I book". Narrowing
 * it to the exact range would make the section identical to a plain filter and
 * lose the client's ±10 intent.
 */
export function suitsAge(event: { ageMin: number; ageMax: number }, age: number): boolean {
  return age >= event.ageMin - AGE_SUGGESTION_MARGIN && age <= event.ageMax + AGE_SUGGESTION_MARGIN;
}

/**
 * A date of birth for someone we only have an age for (Tell A Friend asks the
 * inviter for the friend's age, as the old site did). Six months before
 * their latest possible birthday, so the age reads correctly today and stays
 * right on average. Only a placeholder: the friend is asked for their real
 * date of birth when they accept the invitation.
 */
export function approximateDateOfBirth(age: number, now: Date = new Date()): Date {
  return storedDate(addMonths(todayInSydney(now), -(12 * age + 6)));
}

/** Age on the Sydney date of a given moment (e.g. an event's start, or when they signed up). */
export function ageAt(dob: Date, at: Date): number {
  return yearsBetween(birthDate(dob), calendarDate(dateIn(at, EVENT_TIME_ZONE)));
}
