import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { startCampaignSend, processCampaignSendBatch } from '@/lib/campaigns/runSend';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { blastContentProblem, BLAST_PROBLEM_ON_SEND } from '@/lib/campaigns/fields';

// POST /api/admin/campaigns/:id/send — "Send Blast Now". Starts a new
// CampaignSend (a reusable blast can have many of these over its lifetime),
// unless this blast is already being sent (409). Answers straight away, then
// sends the first batch; the scheduled job (processCampaignSends.ts)
// continues it to completion for larger lists. It used to send the first
// hundred inside the request, which could outlast the server's time limit:
// the page then said it had failed while it was still going out.
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
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

  // Never an email with no subject or a text with no message — whichever
  // page started the send.
  const problem = blastContentProblem(campaign);
  if (problem) return NextResponse.json({ error: BLAST_PROBLEM_ON_SEND[problem] }, { status: 400 });

  const started = await startCampaignSend(params.id);
  if (!started.ok) return NextResponse.json({ error: started.error }, { status: 409 });
  after(() =>
    processCampaignSendBatch(started.sendId).catch((err) => console.error(`Campaign send ${started.sendId}: first batch failed`, err)),
  );
  return NextResponse.json({ sendId: started.sendId, status: 'SENDING', sentCount: 0, totalRecipients: started.totalRecipients });
});
