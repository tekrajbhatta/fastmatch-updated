/**
 * Lazily-created Stripe client, mirroring the shared-instance pattern in
 * src/lib/prisma.ts.
 *
 * Why lazy: `new Stripe(key)` throws immediately when the key is missing
 * ("Neither apiKey nor config.authenticator provided"). Constructing it at
 * module scope meant `next build` crashed during its "Collecting page data"
 * step — Next imports every route module then, so an unset STRIPE_SECRET_KEY
 * failed the whole production build, not just the payment routes. That made
 * the build impossible in CI without handing the pipeline a live Stripe key.
 *
 * Deferring construction to the first actual request means the build never
 * needs the secret, and a missing key surfaces as a clear runtime error on the
 * two payment routes only, leaving the other 51 routes unaffected.
 */
import Stripe from 'stripe';

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        'STRIPE_SECRET_KEY is not set — payment routes cannot run without it.'
      );
    }
    client = new Stripe(key);
  }
  return client;
}

/**
 * Put on every Checkout Session this site opens (metadata.site). The Stripe
 * account may also take payments for other sites — FastmatchLive opens
 * Checkout Sessions with a bookingId too — and a webhook endpoint hears
 * about every session on the account, so the webhook only acts on ours.
 */
export const STRIPE_SITE_TAG = 'fastmatch.com.au';

/**
 * The picture beside the event on Stripe's payment page (Gil, 8 Oct): the
 * event's photo, else the venue's logo, else the venue's picture, else none.
 * Stripe fetches it from the site itself, so only a full https address is
 * given (a site-relative one is completed with APP_URL). Anything else, such
 * as a local http:// address, is left out rather than risk the payment page.
 */
export function checkoutPicture(
  event: { photoUrl: string | null },
  venue: { logoUrl: string | null; imageUrl: string | null },
  appUrl: string | undefined = process.env.APP_URL,
): string | null {
  for (const candidate of [event.photoUrl, venue.logoUrl, venue.imageUrl]) {
    const value = candidate?.trim();
    if (!value) continue;
    try {
      const url = new URL(value, appUrl).toString();
      // Stripe takes addresses up to 2,048 characters.
      if (url.startsWith('https://') && url.length <= 2048) return url;
    } catch {
      // Not an address: try the next picture.
    }
  }
  return null;
}

/**
 * Is this Checkout Session one this site opened? Only if it carries the tag.
 * Every session the site has opened since 4 Oct carries it, and each closed
 * within 30 minutes. Sessions were also accepted, untagged, when they sent
 * the member back to this site's address; once the site moves to
 * fastmatch.com.au, the old site's own sessions do that too, and each one
 * would have emailed Gil to refund a payment that was perfectly fine.
 */
export function isOurCheckoutSession(session: { metadata?: Record<string, string> | null }): boolean {
  return session.metadata?.site === STRIPE_SITE_TAG;
}

// Read at call time, not module load, for the same reason as above.
export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      'STRIPE_WEBHOOK_SECRET is not set — incoming Stripe webhooks cannot be verified.'
    );
  }
  return secret;
}
