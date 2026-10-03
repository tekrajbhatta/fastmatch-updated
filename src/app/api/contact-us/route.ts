import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/emails/send';
import { emailLayout } from '@/lib/emails/layout';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { clientIp, hitRateLimit, LIMITS, rateKey } from '@/lib/rateLimit';
import { escapeHtml } from '@/lib/escapeHtml';

const bodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  message: z.string().min(1),
});

// POST /api/contact-us — no auth required, anyone on the site can use this
export const POST = withErrorHandling(async (req: NextRequest) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const sends = await hitRateLimit(rateKey('contact-ip', clientIp(req)), LIMITS.contactIp.limit, LIMITS.contactIp.windowMs);
  if (!sends.allowed) {
    return NextResponse.json({ error: 'Too many messages. Please try again later, or email gil@fastmatch.com.au.' }, { status: 429 });
  }

  // Escaped: anyone on the site can fill this in, and without it they could
  // put links or images into an email Gil trusts.
  const html = emailLayout(`
    <h1 style="color:#3D1E6D;">New Contact Us message</h1>
    <p><strong>From:</strong> ${escapeHtml(data.name)} (${escapeHtml(data.email)})</p>
    <p style="white-space:pre-wrap;">${escapeHtml(data.message)}</p>
  `);

  await sendEmail({ to: 'gil@fastmatch.com.au', subject: `Contact Us: ${data.name}`, html });

  return NextResponse.json({ ok: true });
});
