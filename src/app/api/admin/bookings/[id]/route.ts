import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { PAYMENT_METHOD_VALUES } from '@/lib/paymentMethod';
import { confirmPendingByAdmin } from '@/lib/adminBooking';
import { placesTaken, capacityProblem } from '@/lib/capacity';
import { closeCheckout } from '@/lib/pendingBooking';
import { BOOKING_MEMBER_SELECT } from '@/lib/memberFields';

const patchSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'REFUNDED']),
  paidAmount: z.number().nonnegative(),
  checkedIn: z.boolean(),
  // Optional so older callers keep working; null = booked online.
  paymentMethod: z.enum(PAYMENT_METHOD_VALUES).nullable().optional(),
});

// PATCH /api/admin/bookings/:id — corrections the host needs to make from the
// Event bookings screen: someone paid cash at the door, a price was different
// on the night, a refund was agreed, or a check-in was missed.
//
// Deliberately narrow. It touches ONLY the booking — payment state and
// attendance. Member details (name, email, mobile) stay on the member's own
// page: editing the same person from two screens is how the two quietly
// disagree with each other.
//
// It does NOT touch Stripe. Marking a booking Paid here records that money
// changed hands somehow (usually cash); it does not take a payment, and
// marking one Refunded does not send money back. Both still have to be done
// in Stripe, or in person.
export const PATCH = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Please check the booking details.' }, { status: 400 });
  const data = parsed.data;

  const existing = await prisma.booking.findUniqueOrThrow({ where: { id: params.id }, include: { member: true, event: true } });

  // Marking someone paid on a cancelled event would book them back in.
  if (data.status === 'CONFIRMED' && existing.status !== 'CONFIRMED' && existing.event.status === 'CANCELLED') {
    return NextResponse.json({ error: 'This event was cancelled, so nobody can be booked into it.' }, { status: 409 });
  }

  // An unpaid online booking marked Paid by hand goes through the same step
  // a card payment does: its friends are booked in, everyone is emailed, the
  // discount code is counted, and its payment page is closed so it can't be
  // paid as well (src/lib/adminBooking.ts). Marking it here used to drop the
  // friends and leave the page open.
  if (existing.status === 'PENDING' && data.status === 'CONFIRMED') {
    const r = await confirmPendingByAdmin(existing.id, {
      method: data.paymentMethod ?? existing.paymentMethod ?? null,
      paidAmount: data.paidAmount,
      checkedIn: data.checkedIn,
    });
    if (!r.ok) return NextResponse.json({ error: `Couldn't mark it paid: ${r.reason}.` }, { status: 409 });
    const saved = await prisma.booking.findUniqueOrThrow({ where: { id: existing.id }, include: { member: { select: BOOKING_MEMBER_SELECT } } });
    return NextResponse.json({ ...saved, ...(r.notice ? { notice: r.notice } : {}) });
  }

  // Cancelling (or refunding) an online booking that's still waiting for
  // payment closes its payment page, so it can't be paid afterwards.
  if (existing.status === 'PENDING' && (data.status === 'CANCELLED' || data.status === 'REFUNDED') && existing.stripePaymentIntentId && !existing.confirmedAt) {
    if ((await closeCheckout(existing)) === 'paid') {
      return NextResponse.json(
        { error: `${existing.member.name} has just paid online, so this booking is being confirmed. Refresh in a moment, then cancel it if you still need to.` },
        { status: 409 },
      );
    }
  }

  // Becoming paid again (from cancelled or refunded) takes a place: the same
  // check as the add screens, so the bookings list can't overbook quietly.
  if (data.status === 'CONFIRMED' && existing.status !== 'CONFIRMED') {
    const taken = await placesTaken(existing.eventId, { excludeMemberId: existing.memberId });
    const one = existing.member.gender === 'MALE' ? { men: 1, women: 0 } : { men: 0, women: 1 };
    const problem = capacityProblem(taken, existing.event, one);
    if (problem) {
      return NextResponse.json(
        { error: `Couldn't mark it paid: ${problem}. Raise the event's maximum first if you mean to overbook.` },
        { status: 409 },
      );
    }
  }

  // Someone cancelled or refunded is no longer coming, so no longer checked
  // in: the tick used to stay, and they could still rate and be matched.
  const leaving = data.status === 'CANCELLED' || data.status === 'REFUNDED';
  const checkedIn = leaving ? false : data.checkedIn;

  const booking = await prisma.booking.update({
    where: { id: params.id },
    data: {
      status: data.status,
      paidAmount: data.paidAmount,
      checkedIn,
      ...(data.paymentMethod !== undefined ? { paymentMethod: data.paymentMethod } : {}),
      // Stamp the time on the transition into checked-in, and clear it on the
      // way back out, so the timestamp can never describe a state the booking
      // isn't in.
      checkedInAt: checkedIn ? existing.checkedInAt ?? new Date() : null,
      // When it was first confirmed, kept from then on.
      ...(data.status === 'CONFIRMED' ? { confirmedAt: existing.confirmedAt ?? new Date() } : {}),
    },
    include: { member: { select: BOOKING_MEMBER_SELECT } },
  });

  return NextResponse.json(booking);
});
