import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/emails/send';
import { emailLayout } from '@/lib/emails/layout';
import { withErrorHandling } from '@/lib/withErrorHandling';

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

  const html = emailLayout(`
    <h1 style="color:#3D1E6D;">New Contact Us message</h1>
    <p><strong>From:</strong> ${data.name} (${data.email})</p>
    <p style="white-space:pre-wrap;">${data.message}</p>
  `);

  await sendEmail({ to: 'gil@fastmatch.com.au', subject: `Contact Us: ${data.name}`, html });

  return NextResponse.json({ ok: true });
});
