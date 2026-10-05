import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { paymentMethodLabel } from '@/lib/paymentMethod';
import { shareMatched } from '@/lib/reports/breakdown';
import { withErrorHandling } from '@/lib/withErrorHandling';

// GET /api/admin/reports/event/:eventId — the Per-event report: attendance
// and matches, plus the old admin's statement — every paid booking with how
// it was paid and how much, total revenue, commissions, expenses, and the
// profit or loss for the night.
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ eventId: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const event = await prisma.event.findUniqueOrThrow({
    where: { id: params.eventId },
    include: { venue: true, city: true, theme: true },
  });

  const bookings = await prisma.booking.findMany({
    where: { eventId: event.id, status: 'CONFIRMED' },
    include: {
      member: { select: { name: true, gender: true } },
      discountCode: { select: { code: true } },
      bookedBy: { select: { member: { select: { name: true } } } },
    },
    orderBy: { badge: 'asc' },
  });
  const men = bookings.filter((b) => b.member.gender === 'MALE').length;
  const women = bookings.filter((b) => b.member.gender === 'FEMALE').length;
  const revenue = bookings.reduce((sum, b) => sum + Number(b.paidAmount), 0);
  const expenses = Number(event.expenses ?? 0);

  const matches = await prisma.match.findMany({ where: { eventId: event.id } });
  const dateMatches = matches.filter((m) => m.result === 'DATE').length;
  const friendMatches = matches.filter((m) => m.result === 'FRIEND').length;

  // How each person paid, in the old report's words. A friend brought by
  // another member was paid for inside that member's online payment. A $0
  // booking online paid nothing by card, so it doesn't say it did.
  const how = (b: (typeof bookings)[number]) =>
    b.bookedBy ? `Paid by ${b.bookedBy.member.name} (brought as a friend)`
    : b.paymentMethod ? paymentMethodLabel(b.paymentMethod)
    : Number(b.paidAmount) === 0 ? (b.discountCode ? 'Free (discount code)' : 'Free')
    : 'Paid online by card';

  const round = (n: number) => Math.round(n * 100) / 100;
  return NextResponse.json({
    event: {
      id: event.id, number: event.number, name: event.name, startsAt: event.startsAt,
      venue: event.venue.name, city: event.city.name, theme: event.theme.name,
    },
    // Everyone who paid (Gil), no-shows included.
    attended: bookings.length,
    men, women,
    // The share of them with at least one match, once the results are in
    // (null before). It was pairs × 2 over attendees, which could pass 100%.
    matchRate: event.matchesCalculated ? shareMatched(bookings.map((b) => b.memberId), matches) : null,
    revenue: round(revenue), expenses: round(expenses), profit: round(revenue - expenses),
    dateMatches, friendMatches,
    statement: {
      lines: bookings.map((b) => ({
        id: b.id,
        badge: b.badge,
        name: b.member.name,
        method: how(b),
        discountCode: b.discountCode?.code ?? null,
        amount: round(Number(b.paidAmount)),
      })),
      revenue: round(revenue),
      // There are no affiliates in the new site, so nothing is ever owed.
      commissions: 0,
      expenses: round(expenses),
      profit: round(revenue - expenses),
    },
  });
});
