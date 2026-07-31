import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { sendEmail } from '@/lib/emails/send';
import { sendSms } from '@/lib/sms/send';
import { campaignEmail } from '@/lib/emails/campaignEmail';

const bodySchema = z.object({
  testTo: z.string().min(1), // matches the real "Send Test" free-text field — email or mobile depending on channel
});

// POST /api/admin/campaigns/:id/test-send — "Send Test Email" on the real
// Details tab. Sends to whatever address/number the admin typed in, not a
// fixed one.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Enter an address to test-send to.' }, { status: 400 });

  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: params.id } });

  if (campaign.sendEmail) {
    const { subject, html } = campaignEmail({
      subject: `[TEST] ${campaign.subject ?? ''}`,
      bodyHtml: campaign.emailBody ?? '',
      unsubscribeUrl: `${process.env.APP_URL}/unsubscribe?token=test`,
    });
    await sendEmail({ to: parsed.data.testTo, subject, html });
  }
  if (campaign.sendSms) {
    await sendSms({ to: parsed.data.testTo, body: `[TEST] ${campaign.smsBody ?? ''}` });
  }

  await prisma.campaign.update({
    where: { id: params.id },
    data: { testSentAt: new Date(), testSentTo: parsed.data.testTo },
  });

  return NextResponse.json({ ok: true });
}
