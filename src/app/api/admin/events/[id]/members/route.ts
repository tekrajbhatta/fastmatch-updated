import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { calculateAge } from '@/lib/age';
import { createAdminBooking, notifyBooked } from '@/lib/adminBooking';
import { PAYMENT_METHOD_VALUES } from '@/lib/paymentMethod';
import {
  CONFIRMATION_OPTIONS,
  sendEmailVerification,
  sendMobileVerification,
} from '@/lib/memberVerification';
import { withErrorHandling } from '@/lib/withErrorHandling';

const schema = z.object({
  password: z.string().min(8, 'The password must be at least 8 characters.'),
  name: z.string().trim().min(1, 'Please enter a name.'),
  gender: z.enum(['MALE', 'FEMALE']),
  email: z.string().trim().email('Please enter a valid email address.'),
  dateOfBirth: z.string().min(1, 'Please enter a date of birth.'),
  mobile: z.string().trim().min(1, 'Please enter a mobile number.'),
  cityId: z.string().min(1, 'Please select a location.'),
  confirmation: z.enum(['CONFIRMED', 'EMAIL', 'PHONE', 'UNCONFIRMED']),
  contactMethod: z.enum(['EMAIL_AND_SMS', 'EMAIL', 'SMS', 'DO_NOT_CONTACT']),
  marketingOptIn: z.boolean(),
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
// agreedTerms stays false, as it did for walk-ins: the admin can't accept the
// T&Cs on someone's behalf, so they'll be asked the first time they book
// online. This booking itself doesn't need it.
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Please check the member details.' }, { status: 400 });
  }
  const data = parsed.data;

  const dob = new Date(data.dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    return NextResponse.json({ error: 'Please enter a valid date of birth.' }, { status: 400 });
  }
  if (calculateAge(dob) < 18) {
    return NextResponse.json({ error: 'Members must be at least 18 years old.' }, { status: 400 });
  }

  const existing = await prisma.member.findUnique({ where: { email: data.email } });
  if (existing) {
    return NextResponse.json(
      { error: `${data.email} is already registered (${existing.name}). Use "Add a new booking" to add them to this event.` },
      { status: 409 },
    );
  }

  const city = await prisma.city.findUnique({ where: { id: data.cityId } });
  if (!city) return NextResponse.json({ error: 'Please select a valid location.' }, { status: 400 });

  const event = await prisma.event.findUniqueOrThrow({ where: { id: params.id } });
  const flags = CONFIRMATION_OPTIONS[data.confirmation];
  const passwordHash = await bcrypt.hash(data.password, 12);

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const member = await tx.member.create({
        data: {
          name: data.name,
          gender: data.gender,
          email: data.email,
          passwordHash,
          dateOfBirth: dob,
          mobile: data.mobile,
          cityId: data.cityId,
          emailVerified: flags.emailVerified,
          mobileVerified: flags.mobileVerified,
          contactMethod: data.contactMethod,
          marketingOptIn: data.marketingOptIn,
          agreedTerms: false,
        },
      });
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
