import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { createAdminBooking, notifyBooked } from '@/lib/adminBooking';
import { PAYMENT_METHOD_VALUES } from '@/lib/paymentMethod';
import {
  CONFIRMATION_OPTIONS,
  sendEmailVerification,
  sendMobileVerification,
} from '@/lib/memberVerification';
import { newMemberFields, checkNewMember, newMemberData } from '@/lib/adminMember';
import { withErrorHandling } from '@/lib/withErrorHandling';

const schema = z.object({
  // The member: the same fields and rules as the Members page's "Add member".
  ...newMemberFields,
  paymentMethod: z.enum(PAYMENT_METHOD_VALUES),
  paidAmount: z.number().nonnegative(),
  checkedIn: z.boolean().default(true),
});

class BookingRefused extends Error {}

// POST /api/admin/events/:id/members — "Add a new member": register someone
// who isn't a member yet AND book them into this event, in one step.
//
// The member row and the booking are written in a single transaction: if the
// booking is refused (e.g. that gender is full) the member isn't created
// either, so a failed attempt can simply be corrected and resubmitted without
// "email already registered" getting in the way.
//
// "Email/Phone confirmation" sets the same two flags self-registration does.
// Whichever side is left unconfirmed is sent its verification link or code,
// as if they'd signed up themselves — without that, an "Unconfirmed" member
// would have no way to ever confirm.
//
// The terms are accepted for them (Gil), and the password is the admin's,
// theirs to keep or change (src/lib/adminMember.ts).
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Please check the member details.' }, { status: 400 });
  }
  const data = parsed.data;

  // Nothing is saved for an address that's already a member's — the password
  // typed here included, so say so (Gil logged in with one that was never set).
  const checked = await checkNewMember(
    data,
    (name) => `${data.email} is already registered (${name}). Nothing was saved, so their password hasn't changed. Use "Add a new booking" to add them to this event.`,
  );
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });

  const event = await prisma.event.findUniqueOrThrow({ where: { id: params.id } });
  const flags = CONFIRMATION_OPTIONS[data.confirmation];
  const passwordHash = await bcrypt.hash(data.password, 12);

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const member = await tx.member.create({ data: newMemberData(data, passwordHash, checked.dob) });
      const booking = await createAdminBooking(tx, event, member, { method: data.paymentMethod, paidAmount: data.paidAmount, checkedIn: data.checkedIn });
      if (!booking.ok) throw new BookingRefused(`${member.name} couldn't be booked in: ${booking.reason}. The member was not created.`);
      return { member, booking };
    });
  } catch (err) {
    if (err instanceof BookingRefused) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }

  const { member, booking } = created;
  // Sent only after the transaction commits — never for a member that was
  // rolled back.
  const verificationEmail = flags.emailVerified ? null : await sendEmailVerification(member);
  const verificationSms = flags.mobileVerified ? null : await sendMobileVerification(member);
  const bookingEmail = await notifyBooked(booking.bookingId);

  return NextResponse.json({
    member: { id: member.id, name: member.name },
    badge: booking.badge,
    notified: { bookingEmail, verificationEmail, verificationSms },
  });
});
