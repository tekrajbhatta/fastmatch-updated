import { prisma } from './prisma';
import { sendEmail } from './emails/send';
import { friendShareRefundEmail } from './emails/eventEmails';
import { refundPartOfCheckout } from './refunds';
import { alertRefundNeeded, notifyAutoRefund } from './paymentAlerts';
import { eventLabel } from './eventLabel';
import { timeZoneForCity } from './timezone';

/** A friend on a group booking who turned out to be booked already, and what their place cost. */
export interface FriendAlreadyBooked {
  name: string;
  email: string;
  amount: number;
}

/**
 * A group payment included friends who were already booked into the event
 * (they booked themselves while the member was paying, say), so their places
 * weren't used. Each one's share goes back to the member's card, Gil is
 * emailed (as for every automatic refund), and the member is told. A share
 * Stripe won't refund is left to Gil, who is emailed the details, and the
 * member is told it will be refunded. It used to be kept, with only a line
 * in the server log.
 *
 * Called once, when the payment confirms the booking. Never throws.
 */
export async function refundFriendsAlreadyBooked(leadBookingId: string, sessionId: string, friends: FriendAlreadyBooked[]): Promise<void> {
  const owed = friends.filter((f) => f.amount > 0);
  if (!owed.length) return;
  try {
    const lead = await prisma.booking.findUniqueOrThrow({
      where: { id: leadBookingId },
      include: { member: true, event: { include: { theme: true, city: true } } },
    });
    const eventName = eventLabel(lead.event);
    for (const f of owed) {
      const r = await refundPartOfCheckout(sessionId, f.amount, {
        bookingId: lead.id,
        reason: 'friend_already_booked',
        // One refund per friend, however many times this is called.
        key: `fastmatch-refund-${sessionId}-friend-${f.email.trim().toLowerCase()}`,
      });
      if (r.outcome === 'not-paid') continue;
      const ok = r.outcome === 'refunded' || r.outcome === 'already-refunded';
      if (ok) {
        await notifyAutoRefund({
          why: 'friendBooked', sessionId, memberName: lead.member.name, memberEmail: lead.member.email,
          eventName, amount: r.amount, friend: { name: f.name, email: f.email },
        });
      } else {
        await alertRefundNeeded({
          sessionId, bookingId: lead.id, memberName: lead.member.name, eventName, amount: f.amount,
          reason: `${f.name} (${f.email}) was already booked into this event, so their place on this booking wasn't used, and the automatic refund of their share didn't go through (${r.reason})`,
        });
      }
      try {
        const { subject, html } = friendShareRefundEmail({
          memberName: lead.member.name, friendName: f.name, eventName, startsAt: lead.event.startsAt,
          timeZone: timeZoneForCity(lead.event.city.name), refunded: ok ? r.amount : null, amount: f.amount,
        });
        await sendEmail({ to: lead.member.email, subject, html });
      } catch (err) {
        console.error(`Booking ${lead.id}: email about ${f.email}'s refunded place failed`, err);
      }
    }
  } catch (err) {
    console.error(`Booking ${leadBookingId}: refunding friends already booked failed — check Stripe`, err);
  }
}
