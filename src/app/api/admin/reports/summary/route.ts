import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// GET /api/admin/reports/summary — combinable filters (theme, city, gender,
// real attendee age range from DOB, event date range), all driving the same
// stat cards + grouped table + trend charts together, not independently.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const params = req.nextUrl.searchParams;
  const themeId = params.get('themeId') || undefined;
  const cityId = params.get('cityId') || undefined;
  const gender = (params.get('gender') as 'MALE' | 'FEMALE') || undefined;
  const ageMin = params.get('ageMin') ? Number(params.get('ageMin')) : undefined;
  const ageMax = params.get('ageMax') ? Number(params.get('ageMax')) : undefined;
  const dateFrom = params.get('dateFrom') ? new Date(params.get('dateFrom')!) : undefined;
  const dateTo = params.get('dateTo') ? new Date(params.get('dateTo')!) : undefined;

  const eventWhere: Prisma.EventWhereInput = {
    ...(themeId ? { themeId } : {}),
    ...(cityId ? { cityId } : {}),
    ...(dateFrom || dateTo ? { startsAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {}),
  };

  const memberWhere: Prisma.MemberWhereInput = {};
  if (gender) memberWhere.gender = gender;
  // The city filter is otherwise about which EVENTS were held in that
  // city (eventWhere.cityId) — but the Member Growth chart isn't about
  // events, it's about registrations. Applying it here to the member's
  // own registered city so "filter by Sydney" consistently means
  // "Sydney" everywhere on the page, not just the attendance figures.
  // Flagged by the developer as needing a decision; this is the
  // interpretation applied — override if a different one is wanted.
  if (cityId) memberWhere.cityId = cityId;
  if (ageMin != null || ageMax != null) {
    const today = new Date();
    memberWhere.dateOfBirth = {};
    if (ageMin != null) {
      const cutoff = new Date(today); cutoff.setFullYear(cutoff.getFullYear() - ageMin);
      (memberWhere.dateOfBirth as any).lte = cutoff;
    }
    if (ageMax != null) {
      const cutoff = new Date(today); cutoff.setFullYear(cutoff.getFullYear() - ageMax - 1);
      (memberWhere.dateOfBirth as any).gte = cutoff;
    }
  }

  const bookingWhere: Prisma.BookingWhereInput = {
    status: 'CONFIRMED',
    event: eventWhere,
    member: memberWhere,
  };

  const [attendeeCount, revenueAgg, matchCount] = await Promise.all([
    prisma.booking.count({ where: bookingWhere }),
    prisma.booking.aggregate({ where: bookingWhere, _sum: { paidAmount: true } }),
    prisma.match.count({ where: { event: eventWhere } }),
  ]);

  const matchRate = attendeeCount > 0 ? Math.round((matchCount * 2 * 100) / attendeeCount) : 0;

  // Grouped breakdown by theme
  const bookings = await prisma.booking.findMany({
    where: bookingWhere,
    include: { event: { include: { theme: true, city: true } } },
  });
  type Group = { attendees: number; revenue: number; expenses: number };
  const blank = (): Group => ({ attendees: 0, revenue: 0, expenses: 0 });
  const byTheme = new Map<string, Group>();
  const byCity = new Map<string, Group>();

  // EXPENSES ARE PER EVENT, REVENUE IS PER BOOKING.
  //
  // Event.expenses is one figure for the night — venue hire, host, catering —
  // not a per-head cost. Adding it inside this per-booking loop would multiply
  // it by the attendee count (up to 24x on a full event) and drive every
  // profit figure deeply, silently negative. Each event is therefore counted
  // exactly once, via this map.
  //
  // Events are taken from the FILTERED bookings rather than from eventWhere
  // alone, so an event's expenses only ever appear alongside that same event's
  // revenue. Pulling every event matching the date/city filter instead would
  // charge expenses for events that contributed no revenue to this view.
  const eventsSeen = new Map<string, { expenses: number; theme: string; city: string }>();
  for (const b of bookings) {
    if (!eventsSeen.has(b.eventId)) {
      eventsSeen.set(b.eventId, {
        expenses: Number(b.event.expenses ?? 0),
        theme: b.event.theme.name,
        city: b.event.city.name,
      });
    }

    const t = byTheme.get(b.event.theme.name) ?? blank();
    t.attendees++; t.revenue += Number(b.paidAmount);
    byTheme.set(b.event.theme.name, t);

    const c = byCity.get(b.event.city.name) ?? blank();
    c.attendees++; c.revenue += Number(b.paidAmount);
    byCity.set(b.event.city.name, c);
  }

  // Now fold each event's expenses in once. An event has exactly one theme and
  // one city, so it lands in exactly one bucket of each.
  let totalExpenses = 0;
  for (const ev of eventsSeen.values()) {
    totalExpenses += ev.expenses;
    const t = byTheme.get(ev.theme); if (t) t.expenses += ev.expenses;
    const c = byCity.get(ev.city); if (c) c.expenses += ev.expenses;
  }

  // Revenue over time (by month) and member growth (registrations by month)
  const revenueByMonth = new Map<string, number>();
  for (const b of bookings) {
    const key = new Date(b.createdAt).toISOString().slice(0, 7);
    revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + Number(b.paidAmount));
  }
  const members = await prisma.member.findMany({ where: memberWhere, select: { createdAt: true } });
  const growthByMonth = new Map<string, number>();
  for (const m of members) {
    const key = new Date(m.createdAt).toISOString().slice(0, 7);
    growthByMonth.set(key, (growthByMonth.get(key) ?? 0) + 1);
  }

  const totalRevenue = Number(revenueAgg._sum.paidAmount ?? 0);
  const withProfit = (m: Map<string, Group>) =>
    Array.from(m.entries()).map(([name, v]) => ({ name, ...v, profit: v.revenue - v.expenses }));

  return NextResponse.json({
    totals: {
      attendees: attendeeCount,
      revenue: totalRevenue,
      expenses: totalExpenses,
      profit: totalRevenue - totalExpenses,
      matchRate,
    },
    byTheme: withProfit(byTheme),
    byCity: withProfit(byCity),
    revenueOverTime: Array.from(revenueByMonth.entries()).sort().map(([month, revenue]) => ({ month, revenue })),
    memberGrowth: Array.from(growthByMonth.entries()).sort().map(([month, count]) => ({ month, count })),
  });
});
