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
  const byTheme = new Map<string, { attendees: number; revenue: number }>();
  const byCity = new Map<string, { attendees: number; revenue: number }>();
  for (const b of bookings) {
    const t = byTheme.get(b.event.theme.name) ?? { attendees: 0, revenue: 0 };
    t.attendees++; t.revenue += Number(b.paidAmount);
    byTheme.set(b.event.theme.name, t);

    const c = byCity.get(b.event.city.name) ?? { attendees: 0, revenue: 0 };
    c.attendees++; c.revenue += Number(b.paidAmount);
    byCity.set(b.event.city.name, c);
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

  return NextResponse.json({
    totals: { attendees: attendeeCount, revenue: Number(revenueAgg._sum.paidAmount ?? 0), matchRate },
    byTheme: Array.from(byTheme.entries()).map(([name, v]) => ({ name, ...v })),
    byCity: Array.from(byCity.entries()).map(([name, v]) => ({ name, ...v })),
    revenueOverTime: Array.from(revenueByMonth.entries()).sort().map(([month, revenue]) => ({ month, revenue })),
    memberGrowth: Array.from(growthByMonth.entries()).sort().map(([month, count]) => ({ month, count })),
  });
});
