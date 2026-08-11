import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// POST .../sends/:sendId/cancel — the (X) button. Cannot be resumed after.
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string; sendId: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const send = await prisma.campaignSend.findUniqueOrThrow({ where: { id: params.sendId } });
  if (send.status !== 'SENDING' && send.status !== 'PAUSED') {
    return NextResponse.json({ error: 'Only a sending or paused send can be cancelled.' }, { status: 409 });
  }

  const updated = await prisma.campaignSend.update({ where: { id: params.sendId }, data: { status: 'CANCELLED' } });
  return NextResponse.json(updated);
});
