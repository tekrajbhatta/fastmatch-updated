import { NextRequest, NextResponse } from 'next/server';
import { Prisma, type Campaign } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { CONTENT_FIELDS } from '@/lib/campaigns/fields';
import { withErrorHandling } from '@/lib/withErrorHandling';

// POST /api/admin/campaigns/:id/duplicate — "Duplicate Blast". A new, Unused
// blast with the same value in every field (Gil) — content, channels,
// preferences, template link and who it goes to. Only its title gets
// "(copy)", so the two can be told apart on the Blasts list.
//
// Not copied: send history (a copy has never been sent), the last test-send
// details, and "Stop re-using" — the copy starts reusable.
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const original = await prisma.campaign.findUniqueOrThrow({ where: { id: params.id } });

  const copied = Object.fromEntries(CONTENT_FIELDS.map((f) => [f, original[f]])) as Pick<Campaign, (typeof CONTENT_FIELDS)[number]>;
  const copy = await prisma.campaign.create({
    data: {
      ...copied,
      title: `${original.title} (copy)`,
      templateId: original.templateId,
      filter: original.filter as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json(copy);
});
