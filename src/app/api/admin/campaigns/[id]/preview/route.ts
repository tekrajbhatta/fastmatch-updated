import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { buildMemberWhere, MemberFilter } from '@/lib/memberFilter';

// POST /api/admin/campaigns/:id/preview — the "Filter" button on the Send
// tab. Accepts the filter currently being edited in the UI (not necessarily
// saved yet) so the admin can try different filters before committing —
// falls back to the campaign's stored filter if none is passed.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: params.id } });
  const body = await req.json().catch(() => ({}));
  const rawFilter = body.filter ?? (campaign.filter as MemberFilter);

  const contactMethods: ('EMAIL_AND_SMS' | 'EMAIL' | 'SMS')[] = [];
  if (campaign.sendEmail) contactMethods.push('EMAIL_AND_SMS', 'EMAIL');
  if (campaign.sendSms) contactMethods.push('EMAIL_AND_SMS', 'SMS');

  const filter: MemberFilter = {
    ...rawFilter,
    marketingOptInOnly: !campaign.ignorePreference,
    contactMethods: campaign.ignorePreference ? undefined : [...new Set(contactMethods)],
    excludeBounced: campaign.sendEmail && !campaign.ignorePreference,
  };
  const where = buildMemberWhere(filter);

  const [count, members] = await Promise.all([
    prisma.member.count({ where }),
    prisma.member.findMany({
      where,
      select: { id: true, name: true, email: true, mobile: true, gender: true, contactMethod: true, city: { select: { name: true } } },
      take: 200,
    }),
  ]);

  return NextResponse.json({ count, members });
}
