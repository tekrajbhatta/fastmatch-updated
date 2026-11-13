import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { sendEmail, providerMessage } from '@/lib/emails/send';
import { sendSms, withOptOut } from '@/lib/sms/send';
import { resolveCampaignEmailHtml } from '@/lib/emails/campaignEmail';
import { cleanRichHtml } from '@/lib/richTextClean';
import { blastRichText } from '@/lib/campaigns/fields';
import { oneLine } from '@/lib/escapeHtml';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { hitRateLimit, rateKey, LIMITS } from '@/lib/rateLimit';
import { maskEmail, maskMobile } from '@/lib/logMask';

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
      .object({ subject: text, heading: blastRichText, freeText: blastRichText, eventDetailsText: text, bookingLink: text, photoUrl: text, bannerImageUrl: text, venueLogoUrl: text, emailBody: text, smsBody: text })
      .partial()
      .optional(),
  })
  .refine((b) => b.email || b.mobile, { message: 'Enter an email address or a mobile number to send the test to.' });

// Shown to the admin who typed the address, so the mail server's answer is
// given as it came (src/lib/emails/send.ts masks it everywhere else).
const reason = (err: unknown) => {
  const raw = providerMessage(err);
  if (raw) return `Email send failed: ${raw}`;
  return err instanceof Error ? err.message : String(err);
};

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

  // A test goes to any address or number typed in, and each text is paid
  // for: plenty for checking a blast over and over, but a cap if an admin
  // login were ever misused to send messages to strangers.
  const tests = await hitRateLimit(rateKey('test-send', admin.id), LIMITS.testSend.limit, LIMITS.testSend.windowMs);
  if (!tests.allowed) {
    return NextResponse.json(
      { error: 'You’ve sent a lot of tests in the last hour. Please wait a while and try again.' },
      { status: 429 },
    );
  }

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
        `${process.env.APP_URL}/unsubscribe?token=test`,
        cleanRichHtml,
      );
      await sendEmail({ to: email, subject: `[TEST] ${oneLine(c.subject ?? '')}`, html });
      result.email = `Test email sent to ${email}.`;
    } catch (err) {
      console.error(`Test email for blast ${params.id} to ${maskEmail(email)} failed`, err);
      errors.push(`The test email to ${email} wasn’t sent: ${reason(err)}`);
    }
  }

  if (mobile) {
    const body = (c.smsBody ?? '').trim();
    if (!body) {
      errors.push('The SMS message is empty. Write one before sending a test SMS.');
    } else {
      try {
        // Exactly what members get: the opt-out line is added to every blast SMS.
        await sendSms({ to: mobile, body: `[TEST] ${withOptOut(body)}` });
        result.sms = `Test SMS sent to ${mobile}.`;
      } catch (err) {
        console.error(`Test SMS for blast ${params.id} to ${maskMobile(mobile)} failed`, err);
        errors.push(`The test SMS to ${mobile} wasn’t sent: ${reason(err)}`);
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
