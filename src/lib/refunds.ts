import type Stripe from 'stripe';
import { getStripe, STRIPE_SITE_TAG } from './stripe';

/** Amounts are in dollars. */
export type RefundResult =
  | { outcome: 'refunded'; amount: number }
  | { outcome: 'already-refunded'; amount: number }
  | { outcome: 'not-paid' }
  | { outcome: 'failed'; reason: string };

/**
 * Refunds, in full, what was paid on one of this site's Stripe payment pages
 * (a booking's stripePaymentIntentId holds its Checkout Session id). The
 * first automatic refunds: until now every refund was done by hand in Stripe.
 *
 * Safe to call twice for the same payment: Stripe is asked first whether it
 * has been refunded, and the refund carries an idempotency key, so a retried
 * webhook, a double click or two admins at once can't send the money back
 * twice. A payment refunded by hand in Stripe counts as refunded.
 *
 * Never throws: the caller decides what a failure means (Gil is emailed to
 * refund it himself).
 */
export async function refundCheckoutSession(sessionId: string, meta: { bookingId: string; reason: string }): Promise<RefundResult> {
  let session: Stripe.Checkout.Session | null = null;
  try {
    const stripe = getStripe();
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge'] });
    const intent = session.payment_intent && typeof session.payment_intent === 'object' ? session.payment_intent : null;
    const intentId = typeof session.payment_intent === 'string' ? session.payment_intent : intent?.id;
    if (session.payment_status !== 'paid' || !intentId) return { outcome: 'not-paid' };

    const charge = intent?.latest_charge && typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
    if (charge?.refunded) return { outcome: 'already-refunded', amount: charge.amount_refunded / 100 };

    // No amount: whatever hasn't been refunded yet, which is all of it.
    const refund = await stripe.refunds.create(
      { payment_intent: intentId, metadata: { site: STRIPE_SITE_TAG, bookingId: meta.bookingId, reason: meta.reason } },
      { idempotencyKey: `fastmatch-refund-${sessionId}` },
    );
    if (refund.status === 'failed' || refund.status === 'canceled') return { outcome: 'failed', reason: `Stripe marked the refund ${refund.status}` };
    return { outcome: 'refunded', amount: refund.amount / 100 };
  } catch (err) {
    const e = err as { code?: string; message?: string } | null;
    if (e?.code === 'charge_already_refunded') return { outcome: 'already-refunded', amount: (session?.amount_total ?? 0) / 100 };
    console.error(`Refund of Stripe checkout ${sessionId} (booking ${meta.bookingId}) failed`, err);
    return { outcome: 'failed', reason: e?.message ?? String(err) };
  }
}

/**
 * Refunds part of what was paid on one of this site's payment pages: one
 * friend's share of a group payment, when that friend turned out to be
 * booked already. `key` makes it safe to call twice for the same share (a
 * retried webhook); a later full refund (the event cancelled) refunds
 * whatever is left. Never throws.
 */
export async function refundPartOfCheckout(
  sessionId: string,
  amount: number,
  meta: { bookingId: string; reason: string; key: string },
): Promise<RefundResult> {
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const intentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (session.payment_status !== 'paid' || !intentId) return { outcome: 'not-paid' };
    const refund = await stripe.refunds.create(
      { payment_intent: intentId, amount: Math.round(amount * 100), metadata: { site: STRIPE_SITE_TAG, bookingId: meta.bookingId, reason: meta.reason } },
      { idempotencyKey: meta.key },
    );
    if (refund.status === 'failed' || refund.status === 'canceled') return { outcome: 'failed', reason: `Stripe marked the refund ${refund.status}` };
    return { outcome: 'refunded', amount: refund.amount / 100 };
  } catch (err) {
    const e = err as { message?: string } | null;
    console.error(`Part refund of Stripe checkout ${sessionId} (booking ${meta.bookingId}) failed`, err);
    return { outcome: 'failed', reason: e?.message ?? String(err) };
  }
}

/**
 * Has what was paid on this payment page been refunded? Only looks: for
 * telling a repeat of a payment notice from one that still needs dealing
 * with. null when Stripe can't be asked.
 */
export async function checkoutRefunded(sessionId: string): Promise<boolean | null> {
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge'] });
    const intent = session.payment_intent && typeof session.payment_intent === 'object' ? session.payment_intent : null;
    const charge = intent?.latest_charge && typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
    return !!charge?.refunded;
  } catch (err) {
    console.error(`Couldn't check Stripe checkout ${sessionId} for a refund`, err);
    return null;
  }
}
