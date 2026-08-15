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
