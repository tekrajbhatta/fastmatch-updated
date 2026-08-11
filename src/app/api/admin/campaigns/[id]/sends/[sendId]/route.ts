import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// GET .../sends/:sendId — poll an individual send's live progress
// ("533/3746 sent"), used by the Current Blasts screen.
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string; sendId: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const send = await prisma.campaignSend.findUniqueOrThrow({ where: { id: params.sendId } });
  return NextResponse.json(send);
});
