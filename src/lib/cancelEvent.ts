import { Prisma } from '@prisma/client';
import type { Booking, Event, EventTheme, Venue, City, Member } from '@prisma/client';
import { prisma } from './prisma';
import { sendEmail } from './emails/send';
import { sendSms } from './sms/send';
import { eventChangeEmail, eventChangeSms, type EventChange } from './emails/eventEmails';
import { eventLabel } from './eventLabel';
import { venueLine } from './venue';
import { eventTimeFor } from './timezone';
import { closeCheckout, dropUnpaidBooking } from './pendingBooking';
import { refundCheckoutSession } from './refunds';
import { alertRefundNeeded, notifyAutoRefund } from './paymentAlerts';
import { endOfEventNight } from './eventNight';
import { paymentMethodLabel } from './paymentMethod';

/*
 * "Cancel event" (Gil, Q2-Q4): separate from hiding an event, which now only
 * hides it. Cancelling:
 *   - marks the event cancelled, so it can't be booked;
 *   - closes payment pages still open, so they can't be paid;
 *   - marks every booking cancelled: a card payment made online is refunded
 *     in full automatically and shows "Cancelled – refunded"; cash, card at
 *     the desk and pay-at-door bookings show "Cancelled", for Gil to refund
 *     himself (the user, 6 Oct);
 *   - emails and texts everyone booked, with Gil's cancellation wording (the
 *     email also says what was refunded to their card).
 * Hiding used to be how an event was cancelled, which told everyone and
 * refunded nobody.
 */

/** On each Stripe refund, so it's clear in Stripe why it was made. */
const REFUND_REASON = 'event_cancelled';
/** How many attendees are refunded and told at once: quick, without a burst at Stripe. */
const AT_ONCE = 5;

type FullEvent = Event & { venue: Venue; theme: EventTheme; city: City };
type Attendee = Booking & { member: Member & { city: City } };

export interface CancelOutcome {
  /** People emailed and texted. */
  notified: number;
  notifyFailures: { member: string; channel: 'email' | 'sms' }[];
  /** Card payments made online, refunded now. */
  refunded: { member: string; amount: number }[];
  /** Online payments Stripe couldn't refund: Gil is emailed to do it by hand. */
  refundFailed: { member: string; reason: string }[];
  /** Paid some other way (cash, card at the desk, at the door): Gil refunds them himself if they paid. */
  byHand: { member: string; amount: number; method: string }[];
  /** Unpaid payment pages closed. */
  paymentsClosed: number;
  /** Paid just as the event was cancelled: refunded as the payment arrives. */
  paymentsArriving: number;
}

/**
 * Why an event can't be cancelled, or null. One whose night is over has
 * happened. One already cancelled can be again only to finish a cancellation
 * that stopped part-way (a restart mid-run, say), leaving `unfinished` people
 * still booked, unrefunded and untold: whenever that's noticed.
 */
export function cancelBlocked(
  event: Pick<Event, 'status' | 'startsAt'> & { city: { name: string } | null },
  now: Date = new Date(),
  unfinished = 0,
): string | null {
  if (event.status === 'CANCELLED') return unfinished > 0 ? null : 'This event has already been cancelled.';
  if (now >= endOfEventNight(event)) return 'This event has already happened, so it can\'t be cancelled.';
  return null;
}

/**
 * Unpaid and still open: a payment page someone may be paying on, rather
 * than a booking. A booking the admin set back to "Pending" (it was confirmed
 * before), or one with no payment page, is a booking: it's cancelled, told,
 * and refunded like the rest (it used to be taken for an open page and left,
 * or quietly deleted).
 */
function isPaymentPage(b: Pick<Booking, 'status' | 'stripePaymentIntentId' | 'confirmedAt'>): boolean {
  return b.status === 'PENDING' && !!b.stripePaymentIntentId && !b.confirmedAt;
}

/** Bookings a cancellation still has to deal with (everything but open payment pages). */
const STILL_BOOKED: Prisma.BookingWhereInput = {
  OR: [{ status: 'CONFIRMED' }, { status: 'PENDING', OR: [{ stripePaymentIntentId: null }, { confirmedAt: { not: null } }] }],
};

/** cancelBlocked, counting what an earlier cancellation left unfinished. */
export async function whyCantCancel(
  event: Pick<Event, 'id' | 'status' | 'startsAt'> & { city: { name: string } | null },
  now: Date = new Date(),
): Promise<string | null> {
  const unfinished = event.status === 'CANCELLED' ? await prisma.booking.count({ where: { eventId: event.id, ...STILL_BOOKED } }) : 0;
  return cancelBlocked(event, now, unfinished);
}

/** Paid on one of this site's payment pages, rather than some other way. */
function paidOnline(b: Pick<Booking, 'paymentMethod' | 'stripePaymentIntentId' | 'bookedById'>): boolean {
  return !b.paymentMethod && !!b.stripePaymentIntentId && !b.bookedById;
}

/** Paid (or to be paid) some other way, so not refunded automatically. A friend's place is part of the payment of whoever brought them. */
function paidByHand(b: Pick<Booking, 'paymentMethod' | 'bookedById' | 'paidAmount'>): boolean {
  return !!b.paymentMethod && b.paymentMethod !== 'FRIEND_BOOKED_IN' && !b.bookedById && Number(b.paidAmount) > 0;
}

/** What cancelling would do, for the admin's "are you sure?". */
export async function cancelPreview(eventId: string) {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, include: { city: true } });
  const bookings = await prisma.booking.findMany({ where: { eventId, status: { in: ['CONFIRMED', 'PENDING'] } } });
  const paid = bookings.filter((b) => !isPaymentPage(b));
  const online = paid.filter(paidOnline);
  const onlineIds = new Set(online.map((b) => b.id));
  // A group's payment covers the friends they brought: their shares are on their own bookings.
  const onlineTotal = paid.filter((b) => onlineIds.has(b.id) || (b.bookedById && onlineIds.has(b.bookedById))).reduce((sum, b) => sum + Number(b.paidAmount), 0);
  return {
    blocked: cancelBlocked(event, new Date(), paid.length),
    // Already cancelled, but some bookings weren't dealt with: this finishes it.
    finishing: event.status === 'CANCELLED',
    attendees: paid.length,
    onlinePayments: online.length,
    onlineTotal: Math.round(onlineTotal * 100) / 100,
    byHand: paid.filter(paidByHand).length,
    unpaidPages: bookings.filter(isPaymentPage).length,
  };
}

/**
 * Cancels the event. Each booking is claimed (-> CANCELLED) before anything
 * is done for it, so running this twice at once (a double click) can't refund
 * or tell anyone twice — and running it again on a cancelled event finishes
 * one that stopped part-way, dealing only with who's left. Refunds come
 * before the emails, so the email can say what was refunded.
 */
export async function cancelEvent(eventId: string): Promise<CancelOutcome> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, include: { venue: true, theme: true, city: true } });
  // First: from now on it can't be booked, and a payment that completes is
  // refunded rather than confirmed (confirmBookingGroup won't confirm it).
  await prisma.event.update({ where: { id: eventId }, data: { status: 'CANCELLED' } });

  const outcome: CancelOutcome = { notified: 0, notifyFailures: [], refunded: [], refundFailed: [], byHand: [], paymentsClosed: 0, paymentsArriving: 0 };
  const bookings: Attendee[] = await prisma.booking.findMany({
    where: { eventId, status: { in: ['PENDING', 'CONFIRMED'] } },
    include: { member: { include: { city: true } } },
    orderBy: { badge: 'asc' },
  });

  // Payment pages still open are closed, so they can't be paid. One being
  // paid this very moment is refunded when its payment arrives (the webhook).
  for (const b of bookings.filter(isPaymentPage)) {
    try {
      if ((await closeCheckout(b)) === 'paid') { outcome.paymentsArriving++; continue; }
      await dropUnpaidBooking(b.id);
      outcome.paymentsClosed++;
    } catch (err) {
      // Still open in Stripe: if it's paid, the webhook refunds it.
      console.error(`Cancelling event ${eventId}: couldn't close the payment page of booking ${b.id}`, err);
    }
  }

  const paid = bookings.filter((x) => !isPaymentPage(x));
  for (let i = 0; i < paid.length; i += AT_ONCE) {
    await Promise.all(paid.slice(i, i + AT_ONCE).map((b) => cancelBooking(event, b, outcome)));
  }
  return outcome;
}

async function cancelBooking(event: FullEvent, b: Attendee, outcome: CancelOutcome): Promise<void> {
  // Claimed in the state it was read in (confirmed, or set back to pending).
  const claimed = await prisma.booking.updateMany({
    where: { id: b.id, status: b.status },
    data: { status: 'CANCELLED', checkedIn: false, checkedInAt: null, pendingFriends: Prisma.DbNull, reopenedFrom: Prisma.DbNull },
  });
  if (claimed.count === 0) return;

  let refunded: number | null = null;
  if (paidOnline(b)) {
    const r = await refundCheckoutSession(b.stripePaymentIntentId!, { bookingId: b.id, reason: REFUND_REASON });
    if (r.outcome === 'refunded' || r.outcome === 'already-refunded') {
      await prisma.booking.update({ where: { id: b.id }, data: { status: 'REFUNDED' } });
      refunded = r.amount;
      outcome.refunded.push({ member: b.member.name, amount: r.amount });
    } else if (r.outcome === 'failed') {
      outcome.refundFailed.push({ member: b.member.name, reason: r.reason });
      await alertRefundNeeded({
        sessionId: b.stripePaymentIntentId!, bookingId: b.id, memberName: b.member.name, eventName: eventLabel(event),
        amount: null, reason: `the event was cancelled, and the automatic refund didn't go through (${r.reason})`,
      });
    } else if (Number(b.paidAmount) > 0) {
      // Marked paid, but nothing was paid on its payment page.
      outcome.byHand.push({ member: b.member.name, amount: Number(b.paidAmount), method: paymentMethodLabel(b.paymentMethod) });
    }
  } else if (paidByHand(b)) {
    outcome.byHand.push({ member: b.member.name, amount: Number(b.paidAmount), method: paymentMethodLabel(b.paymentMethod) });
  }

  await tellCancelled(event, b, refunded, outcome);
}

/** Gil's cancellation email and text, the email with what was refunded to their card. Never throws. */
async function tellCancelled(event: FullEvent, b: Attendee, refunded: number | null, outcome?: CancelOutcome): Promise<void> {
  const change: EventChange = {
    eventName: eventLabel(event), themeName: event.theme.name, ageMin: event.ageMin, ageMax: event.ageMax,
    oldVenue: event.venue.name, newVenue: event.venue.name, newVenueFull: venueLine(event.venue),
    oldStartsAt: event.startsAt, newStartsAt: event.startsAt,
    venueChanged: false, timeChanged: false, cancelled: true,
    // Times are the event's local time; someone registered elsewhere is told whose.
    ...eventTimeFor(event.startsAt, event.city.name, b.member.city.name),
  };
  if (outcome) outcome.notified++;
  try {
    const { subject, html } = eventChangeEmail({ ...change, memberName: b.member.name, refunded });
    await sendEmail({ to: b.member.email, subject, html });
  } catch (err) {
    console.error(`Event ${event.id}: cancellation email to ${b.member.email} failed`, err);
    outcome?.notifyFailures.push({ member: b.member.name, channel: 'email' });
  }
  try {
    await sendSms({ to: b.member.mobile, body: eventChangeSms(change) });
  } catch (err) {
    console.error(`Event ${event.id}: cancellation SMS to ${b.member.mobile} failed`, err);
    outcome?.notifyFailures.push({ member: b.member.name, channel: 'sms' });
  }
}

/**
 * A payment that completed for an event that has been cancelled: its page
 * was being paid as Gil cancelled. Refunded in full automatically, never
 * booked, and the member is told as everyone booked was. Gil is emailed it
 * too, for his records (the user, 6 Oct). Called by the Stripe webhook; on
 * Stripe's retries nothing is refunded or sent twice.
 */
export async function refundPaymentForCancelledEvent(bookingId: string, sessionId: string): Promise<void> {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { member: { include: { city: true } }, event: { include: { venue: true, theme: true, city: true } } },
  });
  if (!b || b.event.status !== 'CANCELLED') return;

  const r = await refundCheckoutSession(sessionId, { bookingId, reason: REFUND_REASON });
  if (r.outcome === 'not-paid') return;
  const ok = r.outcome === 'refunded' || r.outcome === 'already-refunded';
  if (!ok) {
    await alertRefundNeeded({
      sessionId, bookingId, memberName: b.member.name, eventName: eventLabel(b.event), amount: null,
      reason: `it was paid as the event was cancelled, and the automatic refund didn't go through (${r.reason})`,
    });
  }
  // Only while it's still waiting on this payment: the first delivery does it.
  const moved = await prisma.booking.updateMany({
    where: { id: bookingId, status: 'PENDING', stripePaymentIntentId: sessionId },
    data: {
      status: ok ? 'REFUNDED' : 'CANCELLED', ...(ok ? { paidAmount: r.amount } : {}),
      pendingFriends: Prisma.DbNull, reopenedFrom: Prisma.DbNull, checkedIn: false, checkedInAt: null,
    },
  });
  if (!moved.count) return;
  if (ok) await notifyAutoRefund({ why: 'cancelled', sessionId, memberName: b.member.name, memberEmail: b.member.email, eventName: eventLabel(b.event), amount: r.amount });
  await tellCancelled(b.event, b, ok ? r.amount : null);
}
