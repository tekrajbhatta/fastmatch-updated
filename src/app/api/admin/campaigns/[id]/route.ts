import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

// GET /api/admin/campaigns/:id — the "Details" tab
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: params.id },
    include: { sends: { orderBy: { startedAt: 'desc' }, take: 1 } },
  });

  return NextResponse.json({
    ...campaign,
    hasBeenSent: campaign.sends.length > 0,
    blastStatus: campaign.sends[0]?.status ?? 'UNUSED',
  });
}

// PATCH /api/admin/campaigns/:id — "Edit Blast", only allowed while Unused
// (matches the real system: once sent, use Duplicate instead of editing).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const sendCount = await prisma.campaignSend.count({ where: { campaignId: params.id } });
  if (sendCount > 0) {
    return NextResponse.json(
      { error: 'This blast has already been sent — duplicate it to make an editable copy instead.' },
      { status: 409 }
    );
  }

  const updates = await req.json();
  const campaign = await prisma.campaign.update({ where: { id: params.id }, data: updates });
  return NextResponse.json(campaign);
}

// DELETE /api/admin/campaigns/:id — "Delete Blast", only allowed while Unused
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const sendCount = await prisma.campaignSend.count({ where: { campaignId: params.id } });
  if (sendCount > 0) {
    return NextResponse.json(
      { error: 'This blast has been sent before — use Stop re-using blast instead of deleting.' },
      { status: 409 }
    );
  }

  await prisma.campaign.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
