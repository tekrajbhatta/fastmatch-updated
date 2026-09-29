import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { ageAt } from '@/lib/age';
import { EVENT_TIME_ZONE } from '@/lib/datetime';
import { monthIn, startOfDayIn } from '@/lib/timezone';
import {
  buildReport, reportProblem, showsSignups, ageGroupOf,
  type BookingFact, type EventFact, type SignupFact, type Place,
} from '@/lib/reports/breakdown';

const DIMENSIONS = ['month', 'ageGroup', 'location', 'venue', 'event'] as const;
const querySchema = z.object({
  category: z.enum(['month', 'ageGroup', 'location', 'venue']).default('month'),
  group: z.enum([...DIMENSIONS, 'none']).default('none'),
  type: z.enum(['all', 'profitLoss']).default('all'),
  cityId: z.string().optional(),
  venueId: z.string().optional(),
  themeId: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  ageMin: z.coerce.number().int().min(0).optional(),
  ageMax: z.coerce.number().int().min(0).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// GET /api/admin/reports/breakdown — the Summary report table: "Categorise
// by / Group by / Report type" plus the Restrict To filters. Months and date
// filters are in Sydney time, the admin's own.
//
// Definitions (shown under the report too):
//   Signups  — registrations (by the date they joined, their city, their age then)
//   Members  — different members with a paid booking
//   Bookings — paid bookings (Pay at door and cash included, as Gil asked)
//   Matches  — % of those members with at least one date or friend match,
//              over events whose results are in
//   Revenue  — what those bookings paid
//   Expenses — each event's expenses, once per event; Profit = Revenue − Expenses
// Draft events (unsaved duplicates) are left out — a copy carries the
// original's expenses and would count them twice.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const raw = Object.fromEntries([...req.nextUrl.searchParams.entries()].filter(([, v]) => v !== ''));
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Please check the report options.' }, { status: 400 });
  const q = parsed.data;

  const memberFilters = !!q.gender || q.ageMin != null || q.ageMax != null;
  const problem = reportProblem({ category: q.category, group: q.group, type: q.type, memberFilters });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const tz = EVENT_TIME_ZONE;
  const from = q.dateFrom ? startOfDayIn(q.dateFrom, tz) : undefined;
  // "To 30 September" includes the whole of the 30th.
  const to = q.dateTo ? new Date(startOfDayIn(q.dateTo, tz).getTime() + 24 * 60 * 60 * 1000) : undefined;
  const range = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } : undefined;

  const eventWhere: Prisma.EventWhereInput = {
    draft: false,
    ...(q.cityId ? { cityId: q.cityId } : {}),
    ...(q.venueId ? { venueId: q.venueId } : {}),
    ...(q.themeId ? { themeId: q.themeId } : {}),
    ...(range ? { startsAt: range } : {}),
  };

  const events = await prisma.event.findMany({
    where: eventWhere,
    select: {
      id: true, number: true, startsAt: true, expenses: true, matchesCalculated: true,
      city: { select: { id: true, name: true } }, venue: { select: { id: true, name: true } },
    },
  });
  const eventById = new Map(events.map((e) => [e.id, e]));

  const place = (key: string, label: string, sort = label): Place => ({ key, label, sort });
  const eventPlaces = (e: (typeof events)[number]) => {
    const month = monthIn(e.startsAt, tz);
    const day = e.startsAt.toLocaleDateString('en-AU', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' });
    return {
      month: place(month.key, month.label, month.key),
      location: place(e.city.id, e.city.name),
      venue: place(e.venue.id, `${e.venue.name}, ${e.city.name}`),
      event: place(e.id, `#${e.number} ${e.venue.name} — ${day}, ${e.city.name}`, e.startsAt.toISOString()),
    };
  };
  const agePlace = (age: number) => {
    const label = ageGroupOf(age);
    return place(label, label, String(['18–25', '26–34', '35–44', '45–54', '55+'].indexOf(label)));
  };

  // ---- bookings (paid), filtered by the member's gender and age ON THE NIGHT
  const bookingRows = await prisma.booking.findMany({
    where: { status: 'CONFIRMED', eventId: { in: events.map((e) => e.id) }, ...(q.gender ? { member: { gender: q.gender } } : {}) },
    select: { memberId: true, eventId: true, paidAmount: true, member: { select: { dateOfBirth: true } } },
  });
  const matches = await prisma.match.findMany({
    where: { eventId: { in: events.filter((e) => e.matchesCalculated).map((e) => e.id) } },
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

  const eventFacts: EventFact[] = events.map((e) => ({ eventId: e.id, expenses: Number(e.expenses ?? 0), at: eventPlaces(e) }));

  // ---- signups: members who joined in the range, in the chosen location
  let signups: SignupFact[] | null = null;
  const eventOnlyFilters = !!q.venueId || !!q.themeId;
  if (showsSignups({ category: q.category, group: q.group, type: q.type, eventOnlyFilters })) {
    const joined = await prisma.member.findMany({
      where: {
        isAdmin: false,
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

  const report = buildReport({ category: q.category, group: q.group, type: q.type, bookings, events: eventFacts, signups });
  return NextResponse.json({ ...report, signupsHidden: q.type === 'all' && signups === null });
});
