import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { processCampaignSendBatch } from '@/lib/campaigns/runSend';
import { withErrorHandling } from '@/lib/withErrorHandling';

// POST .../sends/:sendId/resume — the (▶) button. Sets status back to
// SENDING and processes one batch straight after answering; the scheduled
// job picks up the rest, continuing from the same locked-in recipient list.
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string; sendId: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const send = await prisma.campaignSend.findUniqueOrThrow({ where: { id: params.sendId } });
  if (send.status !== 'PAUSED') {
    return NextResponse.json({ error: 'Only a paused send can be resumed.' }, { status: 409 });
  }

  // Only from paused, so a double click can't resume it twice.
  const resumed = await prisma.campaignSend.updateMany({ where: { id: params.sendId, status: 'PAUSED' }, data: { status: 'SENDING' } });
  if (resumed.count === 0) return NextResponse.json({ error: 'Only a paused send can be resumed.' }, { status: 409 });
  // Answers straight away; the batch goes out after (as with Send Blast Now).
  after(() =>
    processCampaignSendBatch(params.sendId).catch((err) => console.error(`Campaign send ${params.sendId}: batch after resume failed`, err)),
  );
  return NextResponse.json({ ...send, status: 'SENDING' });
});
