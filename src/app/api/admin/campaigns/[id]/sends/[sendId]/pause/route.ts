import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

// POST .../sends/:sendId/pause — the (||) button on Current Blasts. Takes
// effect on the next scheduled-job batch, not instantly mid-batch.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; sendId: string }> }) {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const send = await prisma.campaignSend.findUniqueOrThrow({ where: { id: params.sendId } });
  if (send.status !== 'SENDING') {
    return NextResponse.json({ error: 'Only a send currently in progress can be paused.' }, { status: 409 });
  }

  const updated = await prisma.campaignSend.update({ where: { id: params.sendId }, data: { status: 'PAUSED' } });
  return NextResponse.json(updated);
}
