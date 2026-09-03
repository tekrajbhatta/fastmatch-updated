import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

const patchSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'REFUNDED']),
  paidAmount: z.number().nonnegative(),
  checkedIn: z.boolean(),
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

  const existing = await prisma.booking.findUniqueOrThrow({ where: { id: params.id } });

  const booking = await prisma.booking.update({
    where: { id: params.id },
    data: {
      status: data.status,
      paidAmount: data.paidAmount,
      checkedIn: data.checkedIn,
      // Stamp the time on the transition into checked-in, and clear it on the
      // way back out, so the timestamp can never describe a state the booking
      // isn't in.
      checkedInAt: data.checkedIn ? existing.checkedInAt ?? new Date() : null,
    },
    include: { member: true },
  });

  return NextResponse.json(booking);
});
