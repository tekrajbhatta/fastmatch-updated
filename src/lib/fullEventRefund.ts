import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { sendEmail } from './emails/send';
import { eventFullRefundEmail } from './emails/eventEmails';
import { refundCheckoutSession } from './refunds';
import { alertRefundNeeded, notifyAutoRefund } from './paymentAlerts';
import { eventLabel } from './eventLabel';
import { timeZoneForCity } from './timezone';

/**
 * A payment for a booking that couldn't be confirmed because the event is
 * full: it came through after the booking's 10-minute hold ran out, and
 * someone else had the last place by then (Gil, Q1). Refunded in full
 * automatically, and the member is told by email. It used to be kept, and
 * the event ran one over.
 *
 * Called by the Stripe webhook. On Stripe's retries nothing is refunded or
 * sent twice: refundCheckoutSession won't refund a payment twice, and only
 * the first delivery moves the booking on from waiting for this payment.
 * A refund Stripe won't make is left to Gil, who is emailed the details;
 * one that goes through is emailed to him too, for his records (the user,
 * 6 Oct).
 */
export async function refundPaymentForFullEvent(bookingId: string, sessionId: string, amountPaid: number | null): Promise<void> {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { member: true, event: { include: { theme: true, city: true } } },
  });
  if (!b) return;

  const r = await refundCheckoutSession(sessionId, { bookingId, reason: 'event_full' });
  if (r.outcome === 'not-paid') return;
  const ok = r.outcome === 'refunded' || r.outcome === 'already-refunded';
  if (!ok) {
    await alertRefundNeeded({
      sessionId, bookingId, memberName: b.member.name, eventName: eventLabel(b.event), amount: amountPaid,
      reason: `the event was full by the time the payment came through, and the automatic refund didn't go through (${r.reason})`,
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
  if (ok) await notifyAutoRefund({ why: 'full', sessionId, memberName: b.member.name, memberEmail: b.member.email, eventName: eventLabel(b.event), amount: r.amount });
  try {
    const { subject, html } = eventFullRefundEmail({
      memberName: b.member.name, eventName: eventLabel(b.event), startsAt: b.event.startsAt,
      timeZone: timeZoneForCity(b.event.city.name), refunded: ok ? r.amount : null, amount: amountPaid,
      eventsUrl: `${(process.env.APP_URL ?? '').replace(/\/+$/, '')}/events`,
    });
    await sendEmail({ to: b.member.email, subject, html });
  } catch (err) {
    console.error(`Booking ${bookingId}: "event full, refunded" email failed`, err);
  }
}
