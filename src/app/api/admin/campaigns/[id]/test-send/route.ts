import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { sendEmail } from '@/lib/emails/send';
import { sendSms, withOptOut } from '@/lib/sms/send';
import { resolveCampaignEmailHtml } from '@/lib/emails/campaignEmail';
import { withErrorHandling } from '@/lib/withErrorHandling';

const text = z.string().max(20_000).nullable().optional();

const bodySchema = z
  .object({
    email: z.string().trim().email('That doesn’t look like an email address.').optional(),
    mobile: z
      .string()
      .trim()
      .regex(/^\+?[\d\s()-]{8,20}$/, 'That doesn’t look like a mobile number.')
      .optional(),
    // What's on screen right now, if it differs from what's saved — so a
    // test shows exactly the version about to go out.
    content: z
      .object({ subject: text, heading: text, freeText: text, eventDetailsText: text, bookingLink: text, photoUrl: text, bannerImageUrl: text, venueLogoUrl: text, emailBody: text, smsBody: text })
      .partial()
      .optional(),
  })
  .refine((b) => b.email || b.mobile, { message: 'Enter an email address or a mobile number to send the test to.' });

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

// POST /api/admin/campaigns/:id/test-send — "Send test email" / "Send test
// SMS". A test email goes to an email address and a test SMS to a mobile;
// the old single box sent both to whatever was typed, so an email+SMS blast
// tried to text an email address.
//
// Reports what really happened, including the provider's own reason when a
// send is refused — the page used to announce "Test sent" whatever the result.
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Please check the test details.' }, { status: 400 });
  }
  const { email, mobile, content } = parsed.data;

  const saved = await prisma.campaign.findUniqueOrThrow({ where: { id: params.id } });
  const c = { ...saved, ...(content ?? {}) };

  const result: { email?: string; sms?: string } = {};
  const errors: string[] = [];

  if (email) {
    try {
      const html = resolveCampaignEmailHtml(
        {
          emailBody: c.emailBody, heading: c.heading, freeText: c.freeText, eventDetailsText: c.eventDetailsText,
          bookingLink: c.bookingLink, photoUrl: c.photoUrl, bannerImageUrl: c.bannerImageUrl, venueLogoUrl: c.venueLogoUrl,
        },
        `${process.env.APP_URL}/unsubscribe?token=test`
      );
      await sendEmail({ to: email, subject: `[TEST] ${c.subject ?? ''}`, html });
      result.email = `Test email sent to ${email}.`;
    } catch (err) {
      console.error(`Test email for blast ${params.id} to ${email} failed`, err);
      errors.push(`The test email to ${email} wasn’t sent — ${reason(err)}`);
    }
  }

  if (mobile) {
    const body = (c.smsBody ?? '').trim();
    if (!body) {
      errors.push('The SMS message is empty — write one before sending a test SMS.');
    } else {
      try {
        // Exactly what members get: the opt-out line is added to every blast SMS.
        await sendSms({ to: mobile, body: `[TEST] ${withOptOut(body)}` });
        result.sms = `Test SMS sent to ${mobile}.`;
      } catch (err) {
        console.error(`Test SMS for blast ${params.id} to ${mobile} failed`, err);
        errors.push(`The test SMS to ${mobile} wasn’t sent — ${reason(err)}`);
      }
    }
  }

  if (result.email || result.sms) {
    await prisma.campaign.update({
      where: { id: params.id },
      data: { testSentAt: new Date(), testSentTo: [result.email && email, result.sms && mobile].filter(Boolean).join(', ') },
    });
  }

  return NextResponse.json({ ...result, errors }, { status: errors.length ? 502 : 200 });
});
