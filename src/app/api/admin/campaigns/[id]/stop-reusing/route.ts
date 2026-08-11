import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// POST /api/admin/campaigns/:id/stop-reusing — "Stop re-using blast".
// Available in both the Unused and already-sent states, per the real
// system. Just marks it non-reusable; history is untouched.
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const campaign = await prisma.campaign.update({ where: { id: params.id }, data: { reusable: false } });
  return NextResponse.json(campaign);
});
