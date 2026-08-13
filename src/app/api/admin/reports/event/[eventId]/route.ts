import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// GET /api/admin/reports/event/:eventId — attendance, payments, expenses,
// profit, and match breakdown for one specific event.
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ eventId: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const event = await prisma.event.findUniqueOrThrow({ where: { id: params.eventId } });

  const bookings = await prisma.booking.findMany({
    where: { eventId: event.id, status: 'CONFIRMED' },
    include: { member: { select: { gender: true } } },
  });
  const men = bookings.filter((b) => b.member.gender === 'MALE').length;
  const women = bookings.filter((b) => b.member.gender === 'FEMALE').length;
  const revenue = bookings.reduce((sum, b) => sum + Number(b.paidAmount), 0);
  const expenses = Number(event.expenses ?? 0);

  const matches = await prisma.match.findMany({ where: { eventId: event.id } });
  const dateMatches = matches.filter((m) => m.result === 'DATE').length;
  const friendMatches = matches.filter((m) => m.result === 'FRIEND').length;

  return NextResponse.json({
    event: { id: event.id, name: event.name, startsAt: event.startsAt },
    attended: bookings.length,
    men, women,
    matchRate: bookings.length > 0 ? Math.round(((dateMatches + friendMatches) * 2 * 100) / bookings.length) : 0,
    revenue, expenses, profit: revenue - expenses,
    dateMatches, friendMatches,
  });
});
