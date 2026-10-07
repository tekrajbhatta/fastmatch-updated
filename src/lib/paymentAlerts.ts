import { sendEmail } from './emails/send';
import { escapeHtml } from './escapeHtml';
import { emailLayout } from './emails/layout';
import { formatPrice } from './price';

/** Where payment problems that need a person go: the same inbox as Contact Us. */
const ADMIN_EMAIL = 'gil@fastmatch.com.au';

/**
 * A card payment arrived that the booking didn't need — for example the
 * admin had already marked it paid by hand — so the money should go back.
 * Logged, and emailed to the admin, because nobody watches the server log.
 * Never throws: the webhook must still answer Stripe.
 */
export async function alertRefundNeeded(opts: {
  sessionId: string;
  bookingId: string;
  memberName?: string | null;
  eventName?: string | null;
  amount?: number | null;
  reason: string;
}): Promise<void> {
  const amount = opts.amount != null ? formatPrice(opts.amount) : 'the amount paid';
  console.error(`REFUND NEEDED: Stripe checkout ${opts.sessionId} for booking ${opts.bookingId} (${opts.memberName ?? 'unknown member'}, ${opts.eventName ?? 'unknown event'}): ${opts.reason}. Refund ${amount} in Stripe.`);
  try {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: 'FastMatch: a card payment needs refunding',
      html: emailLayout(`
        <p style="margin:0 0 16px;">A card payment came through that the booking didn't need, so it should be refunded in Stripe.</p>
        <p style="margin:0 0 16px;"><strong>Member:</strong> ${escapeHtml(opts.memberName ?? 'unknown')}<br>
        <strong>Event:</strong> ${escapeHtml(opts.eventName ?? 'unknown')}<br>
        <strong>Amount:</strong> ${escapeHtml(amount)}<br>
        <strong>Why:</strong> ${escapeHtml(opts.reason)}<br>
        <strong>Stripe checkout:</strong> ${escapeHtml(opts.sessionId)}</p>
        <p style="margin:0 0 16px;">Find the payment in the Stripe dashboard (Payments, search for the member's email) and refund it.</p>
      `),
    });
  } catch (err) {
    console.error('Could not email the refund alert', err);
  }
}

const AUTO_REFUND = {
  full: {
    subject: 'FastMatch: a payment was refunded automatically (event full)',
    what: 'A card payment came through after the event was full, so it was refunded automatically and the member wasn\'t booked in.',
  },
  cancelled: {
    subject: 'FastMatch: a payment was refunded automatically (event cancelled)',
    what: 'A card payment came through after the event was cancelled, so it was refunded automatically.',
  },
  friendBooked: {
    subject: 'FastMatch: part of a payment was refunded automatically (friend already booked)',
    what: 'A member paid for a friend who was already booked into the event, so that friend\'s share was refunded to the member\'s card automatically. The member is booked in as usual.',
  },
} as const;

/**
 * A payment refunded automatically because, by the time it came through, the
 * event was full (src/lib/fullEventRefund.ts) or cancelled
 * (src/lib/cancelEvent.ts); or one friend's share of a group payment, when
 * the friend was already booked (src/lib/friendShareRefund.ts). Nothing for
 * Gil to do: the member has been told
 * and the money is on its way back. He asked to hear about each one all the
 * same (the user, 6 Oct). Never throws.
 */
export async function notifyAutoRefund(opts: {
  why: keyof typeof AUTO_REFUND;
  sessionId: string;
  memberName: string;
  memberEmail: string;
  eventName: string;
  amount: number;
  /** For a friend's share: who it was for. */
  friend?: { name: string; email: string };
}): Promise<void> {
  const { subject, what } = AUTO_REFUND[opts.why];
  try {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject,
      html: emailLayout(`
        <p style="margin:0 0 16px;">${what} They've been emailed. There's nothing you need to do.</p>
        <p style="margin:0 0 16px;"><strong>Member:</strong> ${escapeHtml(opts.memberName)} (${escapeHtml(opts.memberEmail)})<br>
        ${opts.friend ? `<strong>Friend already booked:</strong> ${escapeHtml(opts.friend.name)} (${escapeHtml(opts.friend.email)})<br>` : ''}
        <strong>Event:</strong> ${escapeHtml(opts.eventName)}<br>
        <strong>Refunded:</strong> ${escapeHtml(formatPrice(opts.amount))}<br>
        <strong>Stripe checkout:</strong> ${escapeHtml(opts.sessionId)}</p>
      `),
    });
  } catch (err) {
    console.error('Could not email the automatic refund notice', err);
  }
}
