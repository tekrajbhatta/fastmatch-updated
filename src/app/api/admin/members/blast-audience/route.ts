import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { buildMemberWhere } from '@/lib/memberFilter';
import { memberFilterFromParams } from '@/lib/memberFilterParams';
import { recipientFilter } from '@/lib/campaigns/audience';
import { withErrorHandling } from '@/lib/withErrorHandling';

const bodySchema = z.object({
  // The Members screen's query string, e.g. "search=Gil&ageMin=20&ageMax=60".
  query: z.string().max(2000).default(''),
  sendEmail: z.boolean(),
  sendSms: z.boolean(),
  ignorePreference: z.boolean(),
  excludeBooked: z.boolean().default(false),
  excludeBookedEventId: z.string().nullable().optional(),
});

// POST /api/admin/members/blast-audience — the two numbers on the "blast these
// filtered members" page: how many members the Members filter matches, and
// how many of them this blast would actually reach given its channels and
// the members' own contact preferences. Uses the same recipientFilter as the
// send itself, so the second number is the number that go.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { query, ...channels } = parsed.data;

  const filter = memberFilterFromParams(new URLSearchParams(query));
  const [matching, recipients] = await Promise.all([
    prisma.member.count({ where: buildMemberWhere(filter) }),
    channels.sendEmail || channels.sendSms
      ? prisma.member.count({ where: buildMemberWhere(recipientFilter(filter, channels)) })
      : Promise.resolve(0),
  ]);

  return NextResponse.json({ matching, recipients, filter });
});
