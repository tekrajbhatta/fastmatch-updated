import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { ageAt } from '../age';
import { EVENT_TIME_ZONE } from '../datetime';
import { monthIn, startOfDayIn } from '../timezone';
import { addDays } from '../zonedTime';
import { ageGroupOf, AGE_GROUPS, type BookingFact, type EventFact, type SignupFact, type Place } from './breakdown';

/**
 * What the Summary report and its Overview are built from — one loader, so
 * the table and the Overview under it can't use different rules again.
 *
 *   Bookings — paid ones (Pay at door, cash and card added by the admin, and
 *              friends included: "attended" means everyone who paid, Gil),
 *              for events in the filter, with the member's gender and their
 *              age ON THE NIGHT.
 *   Events   — every event in the filter that has happened, for its
 *              expenses (once each). Not a cancelled one: it didn't happen,
 *              so its expenses aren't a loss on the night (the user, 8 Oct).
 *   Signups  — registrations in the date range, by the member's own city:
 *              accounts that were set up, so not a Tell A Friend invitee or a
 *              friend booked in by someone else who never finished joining.
 * Months and dates are Sydney time, the admin's own. Draft events (unsaved
 * duplicates) are left out: a copy carries its original's expenses.
 */
export const reportFiltersSchema = z.object({
  cityId: z.string().optional(),
  venueId: z.string().optional(),
  themeId: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  ageMin: z.coerce.number().int().min(0).optional(),
  ageMax: z.coerce.number().int().min(0).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type ReportFilters = z.infer<typeof reportFiltersSchema>;

/** Age or gender: these restrict people, not events, so they rule out a profit/loss figure. */
export const hasMemberFilters = (q: ReportFilters) => !!q.gender || q.ageMin != null || q.ageMax != null;
/** A venue or event type: a registration isn't tied to either, so they rule out signups. */
export const hasEventOnlyFilters = (q: ReportFilters) => !!q.venueId || !!q.themeId;

/** The query string as given, empty values dropped. */
export function queryValues(params: URLSearchParams): Record<string, string> {
  return Object.fromEntries([...params.entries()].filter(([, v]) => v !== ''));
}

export async function loadReportFacts(
  q: ReportFilters,
  opts: { signups: boolean },
): Promise<{ bookings: BookingFact[]; events: EventFact[]; signups: SignupFact[] | null }> {
  const tz = EVENT_TIME_ZONE;
  const from = q.dateFrom ? startOfDayIn(q.dateFrom, tz) : undefined;
  // "To 30 September" includes the whole of the 30th.
  const to = q.dateTo ? startOfDayIn(addDays(q.dateTo, 1), tz) : undefined;
  const range = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } : undefined;

  // Only events that have already happened (Gil, 7 Oct): next month's
  // bookings used to count as this report's attendees and revenue.
  // (The Per-event tab still lists every event, an upcoming one at 0.)
  const eventWhere: Prisma.EventWhereInput = {
    draft: false,
    status: { not: 'CANCELLED' },
    ...(q.cityId ? { cityId: q.cityId } : {}),
    ...(q.venueId ? { venueId: q.venueId } : {}),
    ...(q.themeId ? { themeId: q.themeId } : {}),
    startsAt: { ...(range ?? {}), lte: new Date() },
  };

  const rows = await prisma.event.findMany({
    where: eventWhere,
    select: {
      id: true, number: true, startsAt: true, expenses: true, matchesCalculated: true,
      city: { select: { id: true, name: true } }, venue: { select: { id: true, name: true } },
      theme: { select: { id: true, name: true } },
    },
  });
  const eventById = new Map(rows.map((e) => [e.id, e]));

  const place = (key: string, label: string, sort = label): Place => ({ key, label, sort });
  const eventPlaces = (e: (typeof rows)[number]) => {
    const month = monthIn(e.startsAt, tz);
    const day = e.startsAt.toLocaleDateString('en-AU', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' });
    return {
      month: place(month.key, month.label, month.key),
      location: place(e.city.id, e.city.name),
      venue: place(e.venue.id, `${e.venue.name}, ${e.city.name}`),
      event: place(e.id, `#${e.number} ${e.venue.name}, ${day}, ${e.city.name}`, e.startsAt.toISOString()),
      theme: place(e.theme.id, e.theme.name),
    };
  };
  const agePlace = (age: number) => {
    const label = ageGroupOf(age);
    return place(label, label, String(AGE_GROUPS.findIndex((g) => g.label === label)));
  };

  const bookingRows = await prisma.booking.findMany({
    where: { status: 'CONFIRMED', eventId: { in: rows.map((e) => e.id) }, ...(q.gender ? { member: { gender: q.gender } } : {}) },
    select: { memberId: true, eventId: true, paidAmount: true, member: { select: { dateOfBirth: true } } },
  });
  const matches = await prisma.match.findMany({
    where: { eventId: { in: rows.filter((e) => e.matchesCalculated).map((e) => e.id) } },
    select: { eventId: true, memberAId: true, memberBId: true },
  });
  const matchedKeys = new Set(matches.flatMap((m) => [`${m.eventId}:${m.memberAId}`, `${m.eventId}:${m.memberBId}`]));

  const inAgeRange = (age: number) => (q.ageMin == null || age >= q.ageMin) && (q.ageMax == null || age <= q.ageMax);
  const bookings: BookingFact[] = [];
  for (const b of bookingRows) {
    const e = eventById.get(b.eventId)!;
    const age = ageAt(b.member.dateOfBirth, e.startsAt);
    if (!inAgeRange(age)) continue;
    bookings.push({
      memberId: b.memberId,
      eventId: b.eventId,
      paid: Number(b.paidAmount),
      matched: e.matchesCalculated ? matchedKeys.has(`${b.eventId}:${b.memberId}`) : null,
      at: { ...eventPlaces(e), ageGroup: agePlace(age) },
    });
  }

  const events: EventFact[] = rows.map((e) => ({ eventId: e.id, expenses: Number(e.expenses ?? 0), at: eventPlaces(e) }));

  let signups: SignupFact[] | null = null;
  if (opts.signups) {
    const joined = await prisma.member.findMany({
      where: {
        isAdmin: false,
        // Never set up: the account was made for them, not by them.
        awaitingPasswordSetup: false,
        ...(q.cityId ? { cityId: q.cityId } : {}),
        ...(q.gender ? { gender: q.gender } : {}),
        ...(range ? { createdAt: range } : {}),
      },
      select: { createdAt: true, dateOfBirth: true, city: { select: { id: true, name: true } } },
    });
    signups = [];
    for (const m of joined) {
      const age = ageAt(m.dateOfBirth, m.createdAt);
      if (!inAgeRange(age)) continue;
      const month = monthIn(m.createdAt, tz);
      signups.push({ at: { month: place(month.key, month.label, month.key), ageGroup: agePlace(age), location: place(m.city.id, m.city.name) } });
    }
  }

  return { bookings, events, signups };
}
