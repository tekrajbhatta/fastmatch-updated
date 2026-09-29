import type { Prisma, PrismaClient, Event, Member, PaymentMethod } from '@prisma/client';
import { sendBookingConfirmation } from './sendBookingConfirmation';
import { releasePendingBooking } from './pendingBooking';

/**
 * Admin-side booking — the "Add a new booking" and "Add a new member" screens.
 *
 * Differs from the member's own /book route on purpose:
 *   - no Stripe, and no email/mobile/T&Cs gate — the admin is vouching for
 *     the person, and Gil's rule is that whatever payment option he picks,
 *     the booking counts as paid and the member as good to attend;
 *   - no age-range check, matching the old walk-in flow — the admin knows who
 *     they're booking in;
 *   - checked in straight away by default (Gil) — the admin can untick it
 *     for a booking made ahead of the night.
 *
 * Still enforced: one booking per member per event, and the per-gender
 * capacity, so an admin can't silently overbook.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type AdminBookingPayment = { method: PaymentMethod; paidAmount: number; checkedIn: boolean };

export type AdminBookingResult =
  | { ok: true; bookingId: string; badge: number }
  | { ok: false; reason: string };

const STATUS_WORDS: Record<string, string> = {
  CONFIRMED: 'a',
  CANCELLED: 'a cancelled',
  REFUNDED: 'a refunded',
};

export async function createAdminBooking(
  db: Db,
  event: Pick<Event, 'id' | 'maxMen' | 'maxWomen'>,
  member: Pick<Member, 'id' | 'name' | 'gender'>,
  payment: AdminBookingPayment,
): Promise<AdminBookingResult> {
  const existing = await db.booking.findUnique({
    where: { eventId_memberId: { eventId: event.id, memberId: member.id } },
  });
  if (existing?.status === 'PENDING') {
    // An unpaid online booking holds nothing — clear it out of the way (and
    // close its payment page) so the admin's booking can take its place.
    if ((await releasePendingBooking(existing)) === 'paid') {
      return { ok: false, reason: 'has just paid for this event online' };
    }
  } else if (existing) {
    // One row per member per event (a DB constraint), so a cancelled booking
    // has to be re-opened from the bookings screen rather than re-added here.
    return { ok: false, reason: `already has ${STATUS_WORDS[existing.status] ?? 'a'} booking for this event` };
  }

  const booked = await db.booking.count({
    where: { eventId: event.id, status: 'CONFIRMED', member: { gender: member.gender } },
  });
  const capacity = member.gender === 'MALE' ? event.maxMen : event.maxWomen;
  if (booked >= capacity) {
    return { ok: false, reason: `this event is full for ${member.gender === 'MALE' ? 'men' : 'women'} (${booked}/${capacity})` };
  }

  // Same numbering as the member route: next badge across both genders.
  const highest = await db.booking.aggregate({ where: { eventId: event.id }, _max: { badge: true } });
  const badge = (highest._max.badge ?? 0) + 1;

  const booking = await db.booking.create({
    data: {
      eventId: event.id,
      memberId: member.id,
      badge,
      status: 'CONFIRMED',
      paidAmount: payment.paidAmount,
      paymentMethod: payment.method,
      checkedIn: payment.checkedIn,
      checkedInAt: payment.checkedIn ? new Date() : null,
    },
  });
  return { ok: true, bookingId: booking.id, badge };
}

/**
 * "You're booked in" email. Never throws: the booking is already saved, so a
 * mail hiccup must not turn a successful booking into an error for the admin.
 * Returns whether it went, so the screen can say who to contact by hand.
 */
export async function notifyBooked(bookingId: string): Promise<boolean> {
  try {
    await sendBookingConfirmation(bookingId);
    return true;
  } catch (err) {
    console.error(`Booking ${bookingId}: confirmation email failed`, err);
    return false;
  }
}
