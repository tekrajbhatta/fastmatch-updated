import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

// POST /api/admin/members/filter-and-blast — the real "Filter and Blast"
// button: takes the filter currently applied on the Members screen and
// creates a new draft blast with it pre-set, so the admin lands straight on
// an already-filtered Send tab instead of re-entering the same filter twice.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const { filter } = await req.json();

  const campaign = await prisma.campaign.create({
    data: {
      title: 'Untitled blast (from Members filter)',
      filter: filter ?? {},
    },
  });

  return NextResponse.json(campaign);
});
