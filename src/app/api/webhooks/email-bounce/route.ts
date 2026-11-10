import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { verifyMailgunSignature, permanentFailure, signatureToken, MAX_AGE_SECONDS } from '@/lib/mailgunWebhook';
import { hitRateLimit, clearRateLimit, rateKey } from '@/lib/rateLimit';

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

  // Each signed report is acted on once. A signature is good for 15 minutes,
  // so a copied report could otherwise be sent again and again in that time;
  // its token is remembered a minute longer than that. A repeat gets 200 and
  // changes nothing: Mailgun treats any 2xx as delivered and stops (only 406
  // also stops it, and anything else is retried for hours), and there's
  // nothing left to do — the first copy did it.
  const token = signatureToken((payload as Record<string, unknown>).signature) as string; // checked by verifyMailgunSignature
  const tokenKey = rateKey('mg-token', token);
  if (!(await hitRateLimit(tokenKey, 1, MAX_AGE_SECONDS * 1000 + 60_000)).allowed) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const failure = permanentFailure(payload);
  if (failure) {
    try {
      // Email matching ignores capitals, as everywhere else in the site.
      await prisma.member.updateMany({
        where: { email: failure.email },
        data: { emailBounced: true, bounceReason: failure.reason },
      });
    } catch (err) {
      // Not saved: forget the token, so Mailgun's retry of this report counts.
      await clearRateLimit(tokenKey).catch(() => {});
      throw err;
    }
  }

  // 200 for everything else too (deliveries, temporary failures...), so
  // Mailgun doesn't keep retrying reports there's nothing to do with.
  return NextResponse.json({ ok: true });
});
