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
