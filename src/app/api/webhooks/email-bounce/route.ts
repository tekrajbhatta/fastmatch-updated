import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { verifyMailgunSignature, permanentFailure } from '@/lib/mailgunWebhook';

/**
 * Mailgun's bounce reports. In the Mailgun dashboard (Sending > Webhooks),
 * point "Permanent Failure" at https://<site>/api/webhooks/email-bounce and
 * copy the "HTTP webhook signing key" into MAILGUN_WEBHOOK_SIGNING_KEY.
 *
 * A member whose address permanently fails is marked bounced, which leaves
 * them out of email blasts (see src/lib/campaigns/audience.ts). Nothing lands
 * in Gil's inbox either way.
 *
 * Every report must carry Mailgun's signature: an unsigned or forged request
 * is refused, so nobody else can mark members as bounced. With no signing key
 * configured, every report is refused.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  // Read here, not at module scope — see the note in src/lib/emails/send.ts.
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY ?? '';
  if (!signingKey) {
    return NextResponse.json({ error: 'Bounce reports are not configured.' }, { status: 503 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload || !verifyMailgunSignature((payload as Record<string, unknown>).signature, signingKey)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const failure = permanentFailure(payload);
  if (failure) {
    // Email matching ignores capitals, as everywhere else in the site.
    await prisma.member.updateMany({
      where: { email: failure.email },
      data: { emailBounced: true, bounceReason: failure.reason },
    });
  }

  // 200 for everything else too (deliveries, temporary failures...), so
  // Mailgun doesn't keep retrying reports there's nothing to do with.
  return NextResponse.json({ ok: true });
});
