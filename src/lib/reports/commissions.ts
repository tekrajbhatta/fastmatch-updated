import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { EVENT_TIME_ZONE } from '../datetime';
import { startOfDayIn } from '../timezone';
import { addDays } from '../zonedTime';
import { eventLabel } from '../eventLabel';

/**
 * The "Commissions due to affiliates" report (Gil, Nov): one line for each
 * paid booking made with an affiliate's code, as Gil set it out (affiliate,
 * event, date, location, event cost, code, commission %, commission due),
 * with a subtotal for each affiliate and a total at the bottom.
 *
 * The commission is the one recorded when the booking was paid
 * (src/lib/affiliates.ts). As in the rest of the Summary tab, only events
 * that have happened count, never a cancelled one, and only bookings still
 * paid (not refunded or cancelled). Filters: affiliate, code, location,
 * venue, event type and event date.
 */
export const commissionFiltersSchema = z.object({
  affiliateId: z.string().optional(),
  codeId: z.string().optional(),
  cityId: z.string().optional(),
  venueId: z.string().optional(),
  themeId: z.string().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type CommissionFilters = z.infer<typeof commissionFiltersSchema>;

export interface CommissionLine {
  bookingId: string;
  affiliate: string;
  /** Event type and name: "Professional speed dating, 25 to 37 years". */
  event: string;
  eventNumber: number;
  startsAt: string;
  location: string;
  eventCost: number;
  code: string;
  percent: number;
  commission: number;
}
export interface CommissionGroup { affiliate: string; lines: CommissionLine[]; bookings: number; total: number }
export interface CommissionReport { groups: CommissionGroup[]; bookings: number; total: number }

const cents = (n: number) => Math.round(n * 100) / 100;

/** Lines by affiliate (A to Z), each by event date, with subtotals and the total. */
export function groupCommissionLines(lines: CommissionLine[]): CommissionReport {
  const byAffiliate = new Map<string, CommissionLine[]>();
  for (const l of lines) byAffiliate.set(l.affiliate, [...(byAffiliate.get(l.affiliate) ?? []), l]);
  const groups = [...byAffiliate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([affiliate, ls]) => {
      const sorted = [...ls].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.eventNumber - b.eventNumber);
      return { affiliate, lines: sorted, bookings: sorted.length, total: cents(sorted.reduce((s, l) => s + l.commission, 0)) };
    });
  return { groups, bookings: lines.length, total: cents(groups.reduce((s, g) => s + g.total, 0)) };
}

export async function loadCommissionReport(q: CommissionFilters): Promise<CommissionReport> {
  const tz = EVENT_TIME_ZONE;
  const from = q.dateFrom ? startOfDayIn(q.dateFrom, tz) : undefined;
  const to = q.dateTo ? startOfDayIn(addDays(q.dateTo, 1), tz) : undefined;
  const event: Prisma.EventWhereInput = {
    draft: false,
    status: { not: 'CANCELLED' },
    ...(q.cityId ? { cityId: q.cityId } : {}),
    ...(q.venueId ? { venueId: q.venueId } : {}),
    ...(q.themeId ? { themeId: q.themeId } : {}),
    startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}), lte: new Date() },
  };
  const rows = await prisma.booking.findMany({
    where: {
      status: 'CONFIRMED',
      affiliateCommission: { not: null },
      ...(q.affiliateId ? { affiliateId: q.affiliateId } : {}),
      ...(q.codeId ? { discountCodeId: q.codeId } : {}),
      event,
    },
    select: {
      id: true, affiliateCommission: true, affiliateCommissionPercent: true, affiliateCommissionBase: true,
      affiliate: { select: { name: true } },
      discountCode: { select: { code: true } },
      event: { select: { number: true, name: true, startsAt: true, theme: { select: { name: true } }, city: { select: { name: true } } } },
    },
  });
  return groupCommissionLines(rows.map((b) => ({
    bookingId: b.id,
    affiliate: b.affiliate?.name ?? '(an affiliate since removed)',
    event: eventLabel(b.event),
    eventNumber: b.event.number,
    startsAt: b.event.startsAt.toISOString(),
    location: b.event.city.name,
    eventCost: Number(b.affiliateCommissionBase ?? 0),
    // A promotion deleted since (only possible before it was used) leaves no code.
    code: b.discountCode?.code ?? '',
    percent: Number(b.affiliateCommissionPercent ?? 0),
    commission: Number(b.affiliateCommission ?? 0),
  })));
}
