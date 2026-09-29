import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionMember } from '@/lib/auth';
import { lookupDiscount } from '@/lib/memberBooking';
import { withErrorHandling } from '@/lib/withErrorHandling';

const bodySchema = z.object({ code: z.string().min(1).max(50) });

// POST /api/events/:eventId/discount — checks a code as the member types it,
// so the "Booking details" summary on the event page can show the discount
// (or "promotion already used") before they pay. The page prices the booking
// with the same priceBooking() the booking API charges with; the booking API
// re-checks everything regardless. Needs a login: "already used" depends on
// who's asking.
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ eventId: string }> }) => {
  const params = await ctx.params;
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Please enter a discount code.' }, { status: 400 });

  const event = await prisma.event.findUniqueOrThrow({ where: { id: params.eventId } });
  const found = await lookupDiscount(member, event, parsed.data.code);
  if (!found.ok) return NextResponse.json({ error: found.error }, { status: 400 });

  const d = found.discount;
  return NextResponse.json({
    code: d.code,
    type: d.type,
    amount: d.amount == null ? null : Number(d.amount),
    alreadyUsed: found.alreadyUsed,
  });
});
