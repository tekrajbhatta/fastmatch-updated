import { Prisma } from '@prisma/client';
import type { PrismaClient, Event, Member, PaymentMethod } from '@prisma/client';
import { prisma } from './prisma';
import { sendBookingConfirmation } from './sendBookingConfirmation';
import { closeCheckout, releasePendingBooking } from './pendingBooking';
import { confirmBookingGroup } from './memberBooking';
import { refundFriendsAlreadyBooked } from './friendShareRefund';
import { placesTaken, countHeld, capacityProblem, holdCutoff } from './capacity';

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
 * capacity (paid places and places held by open payment pages, as for
 * members), so an admin can't silently overbook.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** method null = paid online (only when confirming an online booking). */
export type AdminBookingPayment = { method: PaymentMethod | null; paidAmount: number; checkedIn: boolean };

export type AdminBookingResult =
  | { ok: true; bookingId: string; badge: number; notified?: boolean; notice?: string }
  | { ok: false; reason: string };

export async function createAdminBooking(
  db: Db,
  event: Pick<Event, 'id' | 'maxMen' | 'maxWomen' | 'status'>,
  member: Pick<Member, 'id' | 'name' | 'gender' | 'email'>,
  payment: AdminBookingPayment,
): Promise<AdminBookingResult> {
  // Everyone on a cancelled event has been told and refunded: nobody new is
  // booked in (and told "You're booked in").
  if (event.status === 'CANCELLED') return { ok: false, reason: 'the event was cancelled' };
  const existing = await db.booking.findUnique({ where: { eventId_memberId: { eventId: event.id, memberId: member.id } } });
  if (existing?.status === 'CONFIRMED') return { ok: false, reason: 'already has a booking for this event' };
  if (existing?.status === 'PENDING') {
    // They're paying online right now (the payment page is still open): the
    // admin's booking confirms that one, friends and all, and closes the
    // page. An attempt they gave up on earlier is cleared out of the way
    // instead, as it always was: the friends on it may not be coming at all.
    if (existing.createdAt >= holdCutoff()) return confirmPendingByAdmin(existing.id, payment);
    if ((await releasePendingBooking(existing)) === 'paid') return { ok: false, reason: 'has just paid for this event online' };
  }

  // The check and the booking happen with the event locked, one at a time,
  // as card payments are confirmed (confirmBookingGroup): an admin add and a
  // payment for the last place at the same moment can't both take it.
  const write = async (tx: Prisma.TransactionClient): Promise<AdminBookingResult> => {
    await tx.$queryRaw`SELECT id FROM \`Event\` WHERE id = ${event.id} FOR UPDATE`;
    const current = await tx.booking.findUnique({ where: { eventId_memberId: { eventId: event.id, memberId: member.id } } });
    if (current?.status === 'CONFIRMED') return { ok: false, reason: 'already has a booking for this event' };
    if (current?.status === 'PENDING') return { ok: false, reason: 'has just started booking online; try again in a moment' };

    const taken = await placesTaken(event.id, { db: tx, excludeMemberId: member.id, excludeEmail: member.email });
    const problem = capacityProblem(taken, event, { men: member.gender === 'MALE' ? 1 : 0, women: member.gender === 'FEMALE' ? 1 : 0 });
    if (problem) return { ok: false, reason: problem };

    const paid = {
      status: 'CONFIRMED' as const,
      paidAmount: payment.paidAmount,
      paymentMethod: payment.method,
      checkedIn: payment.checkedIn,
      checkedInAt: payment.checkedIn ? new Date() : null,
      confirmedAt: new Date(),
    };

    if (current) {
      // A cancelled or refunded booking is reopened (one row per member per
      // event), keeping its badge. Nothing of the old booking carries over: not
      // its discount code (this booking didn't use one), its payment page or
      // who brought them.
      await tx.booking.update({
        where: { id: current.id },
        data: {
          ...paid,
          discountCodeId: null, stripePaymentIntentId: null, bookedById: null, reminderSent: false,
          pendingFriends: Prisma.DbNull, reopenedFrom: Prisma.DbNull,
        },
      });
      return { ok: true, bookingId: current.id, badge: current.badge };
    }

    // Same numbering as the member route: next badge across both genders.
    const highest = await tx.booking.aggregate({ where: { eventId: event.id }, _max: { badge: true } });
    const badge = (highest._max.badge ?? 0) + 1;

    const booking = await tx.booking.create({
      data: { eventId: event.id, memberId: member.id, badge, ...paid },
    });
    return { ok: true, bookingId: booking.id, badge };
  };
  // Already inside a transaction (Add a new member creates the member in the
  // same one): lock there. Otherwise, in one of its own.
  return '$transaction' in db ? (db as PrismaClient).$transaction(write) : write(db as Prisma.TransactionClient);
}

/**
 * The admin confirms an online booking that hasn't been paid — from "Add a
 * new booking", or by marking it Paid on the bookings list. It goes through
 * the same step a card payment does (confirmBookingGroup): the friends on it
 * get their accounts and bookings, everyone is emailed, and the discount code
 * is counted. Doing it any other way used to drop the friends, and leave the
 * payment page open to be paid as well.
 *
 * Confirmed first, then the payment page closed: closing it makes Stripe send
 * "expired", which removes an unpaid booking — by then this one is paid.
 * If the page turns out to have just been paid, it's recorded as the online
 * payment it was (the admin's amount and method aren't applied, and the
 * screen says so); "checked in" always is.
 *
 * Not called inside a transaction: closing the payment page talks to Stripe.
 */
export async function confirmPendingByAdmin(bookingId: string, payment: AdminBookingPayment): Promise<AdminBookingResult> {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { member: true, event: true } });
  if (!b) return { ok: false, reason: 'the booking no longer exists' };
  if (b.status !== 'PENDING') return { ok: false, reason: "it's no longer waiting for payment" };
  if (b.event.status === 'CANCELLED') return { ok: false, reason: 'the event was cancelled' };

  // Room for everyone on it, not counting the places it holds itself.
  const taken = await placesTaken(b.eventId, { excludeBookingId: b.id, excludeEmail: b.member.email });
  const problem = capacityProblem(taken, b.event, countHeld([b]));
  if (problem) return { ok: false, reason: problem };

  const result = await confirmBookingGroup(b.id);
  // Someone took the last place in the moment since the check above.
  if (result.full) return { ok: false, reason: 'the event is now full' };
  const now = await prisma.booking.findUnique({ where: { id: b.id } });
  if (now?.status !== 'CONFIRMED') return { ok: false, reason: 'the booking no longer exists' };

  let paidOnline = false;
  if (b.stripePaymentIntentId) {
    try {
      // Paid on their phone a moment ago. (A booking confirmed before and set
      // back to unpaid by the admin has an old, long-paid page: not this.)
      paidOnline = (await closeCheckout(b)) === 'paid' && !b.confirmedAt;
    } catch (err) {
      // The booking is confirmed either way; if that page is paid later, the
      // webhook flags the payment for a refund.
      console.error(`Booking ${b.id}: couldn't close its payment page`, err);
    }
  }
  await prisma.booking.updateMany({
    where: { id: b.id, status: 'CONFIRMED' },
    data: {
      checkedIn: payment.checkedIn,
      checkedInAt: payment.checkedIn ? now.checkedInAt ?? new Date() : null,
      ...(paidOnline ? {} : { paidAmount: payment.paidAmount, paymentMethod: payment.method }),
    },
  });
  // Friends on it who were booked already weren't added again. Paid online,
  // their shares go back to the card, as when the payment confirms it.
  const already = result.friendsAlreadyBooked ?? [];
  if (paidOnline && already.length && b.stripePaymentIntentId) await refundFriendsAlreadyBooked(b.id, b.stripePaymentIntentId, already);
  const names = already.map((f) => f.name);
  const notices = [
    ...(paidOnline ? [`${b.member.name} had just paid online by card, so it's recorded as an online payment.`] : []),
    ...(names.length
      ? [`${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`} ${names.length === 1 ? 'was' : 'were'} already booked into this event, so ${names.length === 1 ? 'wasn’t' : 'weren’t'} added again${paidOnline ? ' (their share has been refunded to the card)' : ''}.`]
      : []),
  ];
  return {
    ok: true,
    bookingId: b.id,
    badge: b.badge,
    // Not confirmed here means the card payment's own webhook got there first,
    // and has sent the emails.
    notified: result.confirmed ? !result.notifyFailures.includes(b.id) : true,
    ...(notices.length ? { notice: notices.join(' ') } : {}),
  };
}

/**
 * "You're booked in" email. Never throws: the booking is already saved, so a
 * mail hiccup must not turn a successful booking into an error for the admin.
 * Returns whether it went, so the screen can say who to contact by hand.
 * `registered`: a member just added at the event — the same email says how
 * to log in (sendBookingConfirmation).
 */
export async function notifyBooked(bookingId: string, opts: { registered?: boolean } = {}): Promise<boolean> {
  try {
    await sendBookingConfirmation(bookingId, opts);
    return true;
  } catch (err) {
    console.error(`Booking ${bookingId}: confirmation email failed`, err);
    return false;
  }
}
