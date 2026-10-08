/**
 * A payment's page in the Stripe Dashboard. Test payments (the sandbox's)
 * live under /test/. No Stripe import: pages use the helpers below too.
 */
export function stripePaymentUrl(paymentId: string, livemode: boolean): string {
  return `https://dashboard.stripe.com/${livemode ? '' : 'test/'}payments/${encodeURIComponent(paymentId)}`;
}

interface Payer {
  paymentMethod: string | null;
  stripePaymentIntentId?: string | null;
  confirmedAt?: string | Date | null;
}

/**
 * Was this booking paid by card on the site, so there's a payment in Stripe
 * to show? Its own payment, or, for a friend brought by a member, that
 * member's. Not an unpaid booking still on its payment page, nor one the
 * admin recorded as paid some other way (cash, card at the desk…).
 */
export function hasStripePayment(b: Payer & { status: string; bookedBy?: Payer | null }): boolean {
  if (b.status === 'PENDING') return false;
  const payer = b.bookedBy ?? b;
  return !payer.paymentMethod && !!payer.stripePaymentIntentId && !!payer.confirmedAt;
}
