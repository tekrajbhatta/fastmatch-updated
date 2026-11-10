import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/emails/send';
import { emailLayout, EMAIL_HEADING } from '@/lib/emails/layout';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { clientIp, hitRateLimit, LIMITS, rateKey } from '@/lib/rateLimit';
import { escapeHtml, oneLine } from '@/lib/escapeHtml';

// Limits well past anything a real message needs: anyone can send this
// form, and each one becomes an email to Gil.
const bodySchema = z.object({
  name: z.string().min(1, 'Please enter your name.').max(100, 'Please use a shorter name.'),
  email: z.string().max(254, 'Please check your email address.').email('Please check your email address.'),
  message: z.string().min(1, 'Please write your message.').max(5000, 'Please keep your message under 5,000 characters.'),
});

// POST /api/contact-us — no auth required, anyone on the site can use this
export const POST = withErrorHandling(async (req: NextRequest) => {
  // A body that isn't JSON is the sender's mistake (400), not the server's.
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Please check your message.' }, { status: 400 });
  const data = parsed.data;

  const sends = await hitRateLimit(rateKey('contact-ip', clientIp(req)), LIMITS.contactIp.limit, LIMITS.contactIp.windowMs);
  if (!sends.allowed) {
    return NextResponse.json({ error: 'Too many messages. Please try again later, or email gil@fastmatch.com.au.' }, { status: 429 });
  }

  // Escaped: anyone on the site can fill this in, and without it they could
  // put links or images into an email Gil trusts.
  const html = emailLayout(`
    <h1 style="${EMAIL_HEADING}">New Contact Us message</h1>
    <p><strong>From:</strong> ${escapeHtml(data.name)} (${escapeHtml(data.email)})</p>
    <p style="white-space:pre-wrap;">${escapeHtml(data.message)}</p>
  `);

  // The subject isn't HTML, so it isn't escaped, but it is kept to one line.
  // Reply goes to the visitor: it used to go back to the site's own address.
  await sendEmail({ to: 'gil@fastmatch.com.au', subject: `Contact Us: ${oneLine(data.name)}`, html, replyTo: data.email });

  return NextResponse.json({ ok: true });
});
