import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createAdminBooking, notifyBooked } from '@/lib/adminBooking';
import { PAYMENT_METHOD_VALUES } from '@/lib/paymentMethod';
import { withErrorHandling } from '@/lib/withErrorHandling';

// NOTE ON THE SLUG NAME: this lives under [id], not [eventId] as in the client
// delivery. Next.js rejects two different slug names at the same path level,
// and this folder's siblings ([id]/route.ts, [id]/close/route.ts) already use
// [id]. The URL is unchanged — /api/admin/events/<eventId>/bookings still
// resolves here, so the admin screens need no adjustment.

// GET /api/admin/events/:id/bookings — the attendee list on the admin
// Event Bookings screen (badge, name, email/mobile, paid status).
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const bookings = await prisma.booking.findMany({
    where: { eventId: params.id },
    // bookedBy: for a friend's booking, who brought (and paid for) them.
    include: { member: true, bookedBy: { select: { member: { select: { name: true } } } } },
    orderBy: { badge: 'asc' },
  });

  return NextResponse.json(bookings);
});

const addSchema = z.object({
  memberIds: z.array(z.string().min(1)).min(1, 'Select at least one member.').max(50, 'Add at most 50 members at a time.'),
  paymentMethod: z.enum(PAYMENT_METHOD_VALUES),
  paidAmount: z.number().nonnegative(),
  checkedIn: z.boolean().default(true),
});

// POST /api/admin/events/:id/bookings — "Add a new booking": book one or more
// ALREADY-REGISTERED members into this event. Everyone gets the same payment
// status and amount; individual bookings can be adjusted afterwards on the
// Event bookings screen.
//
// Members are processed one at a time and each succeeds or fails on its own —
// one person already booked, or the men's side filling up part-way through,
// shouldn't stop everyone else being added. The response says who was added
// and who wasn't, and why.
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = addSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Please check the booking details.' }, { status: 400 });
  }
  const { memberIds, paymentMethod, paidAmount, checkedIn } = parsed.data;

  const event = await prisma.event.findUniqueOrThrow({ where: { id: params.id } });
  const uniqueIds = [...new Set(memberIds)];
  const members = await prisma.member.findMany({ where: { id: { in: uniqueIds } } });

  const added: { memberId: string; name: string; badge: number; notified: boolean }[] = [];
  const skipped: { memberId: string; name: string | null; reason: string }[] = [];

  for (const id of uniqueIds) {
    const member = members.find((m) => m.id === id);
    if (!member) {
      skipped.push({ memberId: id, name: null, reason: 'The member is not registered yet.' });
      continue;
    }
    const result = await createAdminBooking(prisma, event, member, { method: paymentMethod, paidAmount, checkedIn });
    if (!result.ok) {
      skipped.push({ memberId: id, name: member.name, reason: result.reason });
      continue;
    }
    added.push({ memberId: id, name: member.name, badge: result.badge, notified: await notifyBooked(result.bookingId) });
  }

  return NextResponse.json({ added, skipped });
});
