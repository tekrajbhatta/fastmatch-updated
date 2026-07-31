import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { startCampaignSend } from '@/lib/campaigns/runSend';

// POST /api/admin/campaigns/:id/send — "Send Blast Now". Starts a new
// CampaignSend (a reusable blast can have many of these over its lifetime).
// Processes the first batch immediately; the scheduled job
// (processCampaignSends.ts) continues it to completion for larger lists.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: params.id } });
  if (!campaign.reusable) {
    const sendCount = await prisma.campaignSend.count({ where: { campaignId: params.id } });
    if (sendCount > 0) {
      return NextResponse.json({ error: 'This blast has been set to stop re-using and cannot be sent again.' }, { status: 409 });
    }
  }

  const result = await startCampaignSend(params.id);
  return NextResponse.json(result);
}
