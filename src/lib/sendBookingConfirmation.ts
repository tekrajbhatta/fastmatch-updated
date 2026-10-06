import { prisma } from './prisma';
import { sendEmail } from './emails/send';
import { bookingConfirmationEmail } from './emails/eventEmails';
import { registeredLinks } from './emails/signupEmails';
import { venueLine } from './venue';
import { eventTimeFor } from './timezone';
import { eventLabel } from './eventLabel';

/**
 * The "You're booked in!" email. `registered`: the admin has just added them
 * at the event ("Add a new member"), so the same email also tells them how to
 * log in with the password they were given, or choose their own.
 */
export async function sendBookingConfirmation(bookingId: string, opts: { registered?: boolean } = {}) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { member: { include: { city: true } }, event: { include: { venue: true, city: true, theme: true } } },
  });

  const appUrl = (process.env.APP_URL ?? '').replace(/\/+$/, '');
  // The shared per-event QR/link — logging in identifies the attendee, so
  // this doesn't need to be a per-person token, just a stable event URL.
  const checkInUrl = `${appUrl}/events/${booking.eventId}/checkin`;

  const { subject, html } = bookingConfirmationEmail({
    memberName: booking.member.name,
    eventName: eventLabel(booking.event),
    venue: venueLine(booking.event.venue),
    startsAt: booking.event.startsAt,
    ...eventTimeFor(booking.event.startsAt, booking.event.city.name, booking.member.city.name),
    checkInUrl,
    ...(opts.registered ? { registered: registeredLinks(booking.member) } : {}),
  });

  await sendEmail({ to: booking.member.email, subject, html });
}
