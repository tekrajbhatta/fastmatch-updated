import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

// GET /api/admin/campaigns/:id/sends — the "History" tab: every past (and
// current) send of this blast, most recent first.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const sends = await prisma.campaignSend.findMany({
    where: { campaignId: params.id },
    orderBy: { startedAt: 'desc' },
  });
  return NextResponse.json(sends);
}
