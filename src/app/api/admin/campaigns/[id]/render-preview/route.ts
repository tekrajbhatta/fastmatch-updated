import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { resolveCampaignEmailHtml } from '@/lib/emails/campaignEmail';

// GET /api/admin/campaigns/:id/render-preview — the actual rendered email
// HTML, exactly as it will be sent (same resolveCampaignEmailHtml call the
// real send loop in lib/campaigns/runSend.ts uses). This is what "Preview
// blast" actually needs — the Details tab previously only showed a text
// summary (subject, from address), never what the email looks like.
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: params.id } });

  const html = resolveCampaignEmailHtml(
    {
      emailBody: campaign.emailBody,
      heading: campaign.heading,
      freeText: campaign.freeText,
      eventDetailsText: campaign.eventDetailsText,
      bookingLink: campaign.bookingLink,
      photoUrl: campaign.photoUrl,
      bannerImageUrl: campaign.bannerImageUrl,
    },
    // Preview only — a real send signs a per-member unsubscribe token.
    `${process.env.APP_URL}/unsubscribe?token=preview`
  );

  return NextResponse.json({ html, subject: campaign.subject });
});
