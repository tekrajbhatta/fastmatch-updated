import { sendEmail } from './emails/send';
import { escapeHtml } from './escapeHtml';
import { emailLayout } from './emails/layout';
import { formatPrice } from './price';
import { maskEmail } from './logMask';

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
  /** More for Gil, in the email only, never the log (it can describe a member's own record). */
  detail?: string;
}): Promise<void> {
  const amount = opts.amount != null ? formatPrice(opts.amount) : 'the amount paid';
  // Ids, not names: the checkout and booking find everything, and the
  // member's name stays out of a log kept for weeks (it's in the email to Gil
  // below). A reason can quote a friend's address: masked here only.
  const reasonForLog = opts.reason.replace(/[^\s<>"'(),;:]+@[^\s<>"'(),;:]+/g, (a) => maskEmail(a));
  console.error(`REFUND NEEDED: Stripe checkout ${opts.sessionId} for booking ${opts.bookingId}: ${reasonForLog}. Refund ${amount} in Stripe.`);
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
        ${opts.detail ? `<strong>Details:</strong> ${escapeHtml(opts.detail)}<br>` : ''}
        <strong>Stripe checkout:</strong> ${escapeHtml(opts.sessionId)}</p>
        <p style="margin:0 0 16px;">Find the payment in the Stripe dashboard (Payments, search for the member's email) and refund it.</p>
      `),
    });
  } catch (err) {
    console.error('Could not email the refund alert', err);
  }
}

/**
 * A "once per member" discount code went through on a second paid booking:
 * two payment pages paid at about the same time can both carry it. The place
 * is booked (the member paid what the page asked), so nothing needs
 * refunding; Gil hears about it in case he wants to follow it up. Ids in the
 * log, names only in the email. Never throws.
 */
export async function alertDiscountReused(opts: {
  sessionId: string | null;
  bookingId: string;
  memberName: string;
  memberEmail: string;
  eventName: string;
  code: string;
  discountGiven: number;
}): Promise<void> {
  console.error(`DISCOUNT USED TWICE: booking ${opts.bookingId} (checkout ${opts.sessionId ?? 'none'}) used a once-per-member code a second time.`);
  try {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: 'FastMatch: a discount code was used twice by one member',
      html: emailLayout(`
        <p style="margin:0 0 16px;">A member used a "once per member" discount code on a second booking (two payment pages were paid at about the same time). Their place is booked and nothing needs refunding. This is only so you know, in case you want to follow it up.</p>
        <p style="margin:0 0 16px;"><strong>Member:</strong> ${escapeHtml(opts.memberName)} (${escapeHtml(opts.memberEmail)})<br>
        <strong>Event:</strong> ${escapeHtml(opts.eventName)}<br>
        <strong>Code:</strong> ${escapeHtml(opts.code)}<br>
        <strong>Discount given the second time:</strong> ${escapeHtml(formatPrice(opts.discountGiven))}<br>
        <strong>Stripe checkout:</strong> ${escapeHtml(opts.sessionId ?? 'none (nothing was paid online)')}</p>
      `),
    });
  } catch (err) {
    console.error('Could not email the discount-used-twice notice', err);
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
  // Every reason a friend can't be added (already booked, a cancelled booking,
  // their own payment page open, registered as the other gender, or outside
  // the ages by their date of birth on file) is this one notice: the member
  // who brought them is only ever told the friend "couldn't be added", so
  // nobody learns anything about a member by booking them. Gil's email says
  // which reason (only he reads it, and it's what he needs if they ask).
  friendNotAdded: {
    subject: 'FastMatch: part of a payment was refunded automatically (a friend couldn\'t be added)',
    what: 'A member paid for a friend who couldn\'t be added to their booking, so that friend\'s share was refunded to the member\'s card automatically. The member is booked in as usual, and was told only that their friend couldn\'t be added, not why.',
  },
} as const;

/**
 * A payment refunded automatically because, by the time it came through, the
 * event was full (src/lib/fullEventRefund.ts) or cancelled
 * (src/lib/cancelEvent.ts); or one friend's share of a group payment, when
 * the friend couldn't be added (src/lib/friendShareRefund.ts). Nothing for
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
  /** For a friend's share: who it was for (as the member typed them), and why they weren't added. */
  friend?: { name: string; email: string; reason?: string };
}): Promise<void> {
  const { subject, what } = AUTO_REFUND[opts.why];
  try {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject,
      html: emailLayout(`
        <p style="margin:0 0 16px;">${what} They've been emailed. There's nothing you need to do.</p>
        <p style="margin:0 0 16px;"><strong>Member:</strong> ${escapeHtml(opts.memberName)} (${escapeHtml(opts.memberEmail)})<br>
        ${opts.friend ? `<strong>Friend not added:</strong> ${escapeHtml(opts.friend.name)} (${escapeHtml(opts.friend.email)})<br>` : ''}
        ${opts.friend?.reason ? `<strong>Why:</strong> ${escapeHtml(opts.friend.reason)}<br>` : ''}
        <strong>Event:</strong> ${escapeHtml(opts.eventName)}<br>
        <strong>Refunded:</strong> ${escapeHtml(formatPrice(opts.amount))}<br>
        <strong>Stripe checkout:</strong> ${escapeHtml(opts.sessionId)}</p>
      `),
    });
  } catch (err) {
    console.error('Could not email the automatic refund notice', err);
  }
}
