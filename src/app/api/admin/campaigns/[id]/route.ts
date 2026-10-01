import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { campaignPatchSchema } from '@/lib/campaigns/fields';

// GET /api/admin/campaigns/:id — the "Details" tab
export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
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
});

// PATCH /api/admin/campaigns/:id — "Edit Blast". Allowed whether or not the
// blast has been sent before (Gil: he edits a blast and sends it again rather
// than creating a new one each time). Changes apply to its NEXT send.
//
// Not while a send is actually in progress, though: the send reads the
// content batch by batch, so an edit mid-send would give half the list one
// email and half another. The filter can still change — each send keeps its
// own snapshot of the filter it started with.
export const PATCH = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = campaignPatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Please check the blast details.' }, { status: 400 });
  }
  const { filter, ...content } = parsed.data;

  if (Object.keys(content).length > 0) {
    const inFlight = await prisma.campaignSend.count({
      where: { campaignId: params.id, status: { in: ['SENDING', 'PAUSED'] } },
    });
    if (inFlight > 0) {
      return NextResponse.json(
        { error: 'This blast is being sent right now. Wait for it to finish (or cancel it on the Send tab) before editing.' },
        { status: 409 }
      );
    }
  }

  const campaign = await prisma.campaign.update({
    where: { id: params.id },
    data: { ...content, ...(filter ? { filter } : {}) },
  });
  return NextResponse.json(campaign);
});

// DELETE /api/admin/campaigns/:id — "Delete Blast", only allowed while Unused
export const DELETE = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const sendCount = await prisma.campaignSend.count({ where: { campaignId: params.id } });
  if (sendCount > 0) {
    return NextResponse.json(
      { error: 'This blast has been sent before. Use Stop re-using blast instead of deleting.' },
      { status: 409 }
    );
  }

  await prisma.campaign.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
