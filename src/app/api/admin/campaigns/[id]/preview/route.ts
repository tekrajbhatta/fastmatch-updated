import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { buildMemberWhere, MemberFilter } from '@/lib/memberFilter';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { recipientFilter } from '@/lib/campaigns/audience';
import { withMobileMatches } from '@/lib/memberSearch';
import { blastFilterSchema, BAD_FILTER } from '@/lib/campaigns/fields';

// POST /api/admin/campaigns/:id/preview — the "Filter" button on the Send
// tab. Accepts the filter currently being edited in the UI (not necessarily
// saved yet) so the admin can try different filters before committing —
// falls back to the campaign's stored filter if none is passed.
export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: params.id } });
  const body = await req.json().catch(() => ({}));
  // The filter being edited goes straight into a database query, so only the
  // page's own filter fields, as plain values (blastFilterSchema). The saved
  // one was checked when it was saved; it's read the same way, as a blast
  // saved before that check may hold something else.
  const parsed = blastFilterSchema.safeParse(body?.filter ?? campaign.filter ?? {});
  if (!parsed.success) return NextResponse.json({ error: BAD_FILTER }, { status: 400 });

  const where = buildMemberWhere(recipientFilter(await withMobileMatches(parsed.data as MemberFilter), campaign));

  const [count, members] = await Promise.all([
    prisma.member.count({ where }),
    prisma.member.findMany({
      where,
      select: { id: true, name: true, email: true, mobile: true, gender: true, contactMethod: true, city: { select: { name: true } } },
      take: 200,
    }),
  ]);

  return NextResponse.json({ count, members });
});
