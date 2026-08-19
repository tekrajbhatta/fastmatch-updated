import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandling } from '@/lib/withErrorHandling';

/**
 * Email provider webhook for bounces. This is the modern equivalent of the old
 * system's "bounces go to a separate inbox" — instead of a human reading a
 * mailbox, the provider POSTs the bounce event here automatically, and the
 * member's emailBounced flag is set immediately so they're excluded from
 * future campaign sends. Nothing lands in Gil's inbox either way.
 *
 * PROVIDER: Mailgun. Note that Mailgun does NOT post this shape by default —
 * its webhook payload is `{ signature: {...}, "event-data": { event: 'failed',
 * recipient, ... } }`. Two things are still outstanding before this endpoint
 * is production-ready:
 *   1. Map Mailgun's `event-data` shape onto the fields used below.
 *   2. Verify Mailgun's HMAC signature (timestamp + token signed with the
 *      Mailgun signing key) — do not process unverified requests in
 *      production, or anyone can mark arbitrary members as bounced.
 * Until then this endpoint safely ignores anything it doesn't recognise.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const payload = await req.json();

  // Minimal shape this endpoint currently understands:
  // { type: 'bounced', email: string, reason?: string }
  // See the note above about mapping Mailgun's own `event-data` payload.
  if (payload.type !== 'bounced' || !payload.email) {
    return NextResponse.json({ ok: true }); // ignore anything else this endpoint doesn't handle
  }

  await prisma.member.updateMany({
    where: { email: payload.email },
    data: { emailBounced: true, bounceReason: payload.reason ?? 'Bounced' },
  });

  return NextResponse.json({ ok: true });
});
