import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { buildMemberWhere } from '@/lib/memberFilter';
import { memberFilterFromParams } from '@/lib/memberFilterParams';
import { recipientFilter } from '@/lib/campaigns/audience';
import { countLeftOut, listLeftOut } from '@/lib/campaigns/leftOutQuery';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { withMobileMatches } from '@/lib/memberSearch';

const bodySchema = z.object({
  // The Members screen's query string, e.g. "search=Gil&ageMin=20&ageMax=60".
  query: z.string().max(2000).default(''),
  sendEmail: z.boolean(),
  sendSms: z.boolean(),
  ignorePreference: z.boolean(),
  excludeBooked: z.boolean().default(false),
  excludeBookedEventId: z.string().nullable().optional(),
  // "See who": also the names of those left out, under each reason.
  details: z.boolean().default(false),
});

// POST /api/admin/members/blast-audience — the numbers on the "blast these
// filtered members" page: how many members the Members filter matches, how
// many of them this blast would actually reach given its channels and the
// members' own contact preferences, and why the rest are left out, with a
// count for each reason (src/lib/campaigns/leftOut.ts). Uses the same
// recipientFilter as the send itself, so the second number is the number
// that go, and the left-out counts add up to the rest.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { query, details, ...channels } = parsed.data;

  const filter = await withMobileMatches(memberFilterFromParams(new URLSearchParams(query)));
  const [matching, recipients, leftOut, leftOutMembers] = await Promise.all([
    prisma.member.count({ where: buildMemberWhere(filter) }),
    channels.sendEmail || channels.sendSms
      ? prisma.member.count({ where: buildMemberWhere(recipientFilter(filter, channels)) })
      : Promise.resolve(0),
    countLeftOut(filter, channels),
    details ? listLeftOut(filter, channels) : Promise.resolve(undefined),
  ]);

  // The filter as the Members screen states it (the mobile matches are worked out, not part of it).
  const { mobileMatchIds: _matched, ...stated } = filter;
  return NextResponse.json({ matching, recipients, leftOut, ...(leftOutMembers ? { leftOutMembers } : {}), filter: stated });
});
