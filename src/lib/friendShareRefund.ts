import { prisma } from './prisma';
import { sendEmail } from './emails/send';
import { friendShareRefundEmail } from './emails/eventEmails';
import { refundPartOfCheckout } from './refunds';
import { alertRefundNeeded, notifyAutoRefund } from './paymentAlerts';
import { eventLabel } from './eventLabel';
import { timeZoneForCity } from './timezone';

/**
 * A friend on a group booking who couldn't be added to it when it was
 * confirmed, as the member typed them, and what their place cost.
 * `reason` is for Gil only: the member who brought them is never told it.
 */
export interface FriendNotAdded {
  name: string;
  email: string;
  amount: number;
  reason?: string;
}

/** The old name (only friends already booked used to be left out); src/lib/adminBooking.ts still uses it. */
export type FriendAlreadyBooked = FriendNotAdded;

/**
 * Friends on a group booking who couldn't be added when it was confirmed:
 * booked already, a cancelled booking, their own payment page open, or (by
 * their own account) the other gender or outside the ages
 * (src/lib/memberBooking.ts). Their places weren't used.
 *
 * Paid online (`sessionId`): each one's share goes back to the member's card,
 * Gil is emailed (as for every automatic refund, with the reason), and the
 * member is told, in the same words whatever the reason. A share Stripe won't
 * refund is left to Gil, who is emailed the details, and the member is told
 * it will be refunded. A friend whose place cost nothing (a free booking, no
 * `sessionId`) has nothing to refund: the member is just told.
 *
 * Called once, when the booking is confirmed. Never throws.
 */
export async function refundFriendsNotAdded(leadBookingId: string, sessionId: string | null, friends: FriendNotAdded[]): Promise<void> {
  if (!friends.length) return;
  try {
    const lead = await prisma.booking.findUniqueOrThrow({
      where: { id: leadBookingId },
      include: { member: true, event: { include: { theme: true, city: true } } },
    });
    const eventName = eventLabel(lead.event);
    for (const f of friends) {
      let refunded: number | null = null;
      const owed = sessionId && f.amount > 0 ? f.amount : 0;
      if (owed > 0 && sessionId) {
        const r = await refundPartOfCheckout(sessionId, owed, {
          bookingId: lead.id,
          reason: 'friend_not_added',
          // One refund per friend, however many times this is called.
          key: `fastmatch-refund-${sessionId}-friend-${f.email.trim().toLowerCase()}`,
        });
        if (r.outcome === 'not-paid') continue;
        if (r.outcome === 'refunded' || r.outcome === 'already-refunded') {
          refunded = r.amount;
          await notifyAutoRefund({
            why: 'friendNotAdded', sessionId, memberName: lead.member.name, memberEmail: lead.member.email,
            eventName, amount: r.amount, friend: { name: f.name, email: f.email, reason: f.reason },
          });
        } else {
          await alertRefundNeeded({
            sessionId, bookingId: lead.id, memberName: lead.member.name, eventName, amount: owed,
            reason: `${f.name} (${f.email}) couldn't be added to this booking, so their place wasn't used, and the automatic refund of their share didn't go through (${r.reason})`,
            ...(f.reason ? { detail: `Why they couldn't be added: ${f.reason}` } : {}),
          });
        }
      }
      try {
        const { subject, html } = friendShareRefundEmail({
          memberName: lead.member.name, friendName: f.name, eventName, startsAt: lead.event.startsAt,
          timeZone: timeZoneForCity(lead.event.city.name), refunded, amount: owed,
        });
        await sendEmail({ to: lead.member.email, subject, html });
      } catch (err) {
        console.error(`Booking ${lead.id}: email about a friend who couldn't be added failed`, err);
      }
    }
  } catch (err) {
    console.error(`Booking ${leadBookingId}: refunding friends who couldn't be added failed — check Stripe`, err);
  }
}

/** The old name, for src/lib/adminBooking.ts (paid online, so always a payment to refund from). */
export function refundFriendsAlreadyBooked(leadBookingId: string, sessionId: string, friends: FriendNotAdded[]): Promise<void> {
  return refundFriendsNotAdded(leadBookingId, sessionId, friends);
}
