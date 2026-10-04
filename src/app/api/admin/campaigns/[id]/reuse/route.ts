import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// POST /api/admin/campaigns/:id/reuse — "Use again". Undoes "Stop re-using
// blast", which used to be permanent: the blast can be sent again and is
// offered on "Blast filtered members" again. History is untouched.
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const campaign = await prisma.campaign.update({ where: { id: params.id }, data: { reusable: true } });
  return NextResponse.json(campaign);
});
