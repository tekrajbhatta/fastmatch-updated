import { prisma } from './prisma';
import jwt from 'jsonwebtoken';
import { sendEmail } from './emails/send';
import { bookingConfirmationEmail } from './emails/eventEmails';

const JWT_SECRET = process.env.JWT_SECRET as string;

export async function sendBookingConfirmation(bookingId: string) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { member: true, event: true },
  });

  // The shared per-event QR/link — logging in identifies the attendee, so
  // this doesn't need to be a per-person token, just a stable event URL.
  const checkInUrl = `${process.env.APP_URL}/events/${booking.eventId}/checkin`;

  const { subject, html } = bookingConfirmationEmail({
    memberName: booking.member.name,
    eventName: booking.event.name,
    venue: booking.event.venue,
    startsAt: booking.event.startsAt,
    checkInUrl,
  });

  await sendEmail({ to: booking.member.email, subject, html });
}
