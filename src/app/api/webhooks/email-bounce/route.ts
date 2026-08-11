import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandling } from '@/lib/withErrorHandling';

/**
 * Email provider webhook for bounces (Resend, or whichever provider is
 * chosen, supports this). This is the modern equivalent of the old system's
 * "bounces go to a separate inbox" — instead of a human reading a mailbox,
 * the provider POSTs the bounce event here automatically, and the member's
 * emailBounced flag is set immediately so they're excluded from future
 * campaign sends. Nothing lands in Gil's inbox either way.
 *
 * TODO: verify the webhook signature once the provider is chosen (Resend
 * signs webhook payloads — don't process unverified requests in production).
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const payload = await req.json();

  // Shape varies by provider — adjust once Resend (or chosen provider) is
  // wired up. Expected minimal shape: { type: 'bounced', email: string, reason?: string }
  if (payload.type !== 'bounced' || !payload.email) {
    return NextResponse.json({ ok: true }); // ignore anything else this endpoint doesn't handle
  }

  await prisma.member.updateMany({
    where: { email: payload.email },
    data: { emailBounced: true, bounceReason: payload.reason ?? 'Bounced' },
  });

  return NextResponse.json({ ok: true });
});
