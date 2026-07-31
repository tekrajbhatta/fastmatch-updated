import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { processCampaignSendBatch } from '@/lib/campaigns/runSend';

// POST .../sends/:sendId/resume — the (▶) button. Sets status back to
// SENDING and processes one batch immediately; the scheduled job picks up
// the rest, continuing from the same locked-in recipient list.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; sendId: string }> }) {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const send = await prisma.campaignSend.findUniqueOrThrow({ where: { id: params.sendId } });
  if (send.status !== 'PAUSED') {
    return NextResponse.json({ error: 'Only a paused send can be resumed.' }, { status: 409 });
  }

  await prisma.campaignSend.update({ where: { id: params.sendId }, data: { status: 'SENDING' } });
  const result = await processCampaignSendBatch(params.sendId);
  return NextResponse.json(result);
}
