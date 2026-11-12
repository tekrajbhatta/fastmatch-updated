import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { buildMemberWhere, type MemberFilter } from '@/lib/memberFilter';
import { recipientFilter } from './audience';
import { leftOutReason, sortLeftOut, type LeftOutBlast, type LeftOutGroup } from './leftOut';

/**
 * The counts and names behind "Left out: …" on the blast page
 * (src/lib/campaigns/leftOut.ts says why each member is left out).
 *
 * Only members the send itself leaves out are looked at: the filter's members
 * without the send's own conditions (recipientFilter on an empty filter, the
 * same function the send uses). So the counts always add up to the filtered
 * members minus those who receive it.
 */

type Blast = LeftOutBlast & { excludeBookedEventId?: string | null };

/** Members the filter matches that this blast won't reach. */
function leftOutWhere(filter: MemberFilter, blast: Blast): Prisma.MemberWhereInput {
  return { AND: [buildMemberWhere(filter), { NOT: buildMemberWhere(recipientFilter({}, blast)) }] };
}

/** Not booked, as "Exclude booked members" means it (the send's own rule). */
function notBookedWhere(blast: Blast): Prisma.MemberWhereInput {
  return buildMemberWhere({ excludeBookedIn: { eventId: blast.excludeBookedEventId ?? null } });
}

const SETTINGS = ['marketingOptIn', 'awaitingPasswordSetup', 'emailVerified', 'emailBounced', 'mobileVerified', 'contactMethod'] as const;

/** How many are left out for each reason, largest first. Nothing when no channel is ticked. */
export async function countLeftOut(filter: MemberFilter, blast: Blast): Promise<LeftOutGroup[]> {
  if (!blast.sendEmail && !blast.sendSms) return [];
  const base = leftOutWhere(filter, blast);
  // Counted by settings, not member by member: a handful of groups even for
  // 50,000 members. Split by having a mobile (only a text needs one) and by
  // being booked (only with "Exclude booked members"), which settings can't show.
  const mobileSplits = blast.sendSms ? [true, false] : [true];
  const bookedSplits = blast.excludeBooked ? [true, false] : [false];
  const totals = new Map<string, number>();
  await Promise.all(mobileSplits.flatMap((hasMobile) => bookedSplits.map(async (booked) => {
    const parts: Prisma.MemberWhereInput[] = [base];
    if (blast.sendSms) parts.push(hasMobile ? { NOT: { mobile: '' } } : { mobile: '' });
    if (blast.excludeBooked) parts.push(booked ? { NOT: notBookedWhere(blast) } : notBookedWhere(blast));
    const groups = await prisma.member.groupBy({ by: [...SETTINGS], where: { AND: parts }, _count: { _all: true } });
    for (const g of groups) {
      // Never null here (they're all left out); "other" would still keep the total right.
      const key = leftOutReason({ ...g, hasMobile, booked }, blast) ?? 'other';
      totals.set(key, (totals.get(key) ?? 0) + g._count._all);
    }
  })));
  return sortLeftOut([...totals].map(([key, count]) => ({ key, count })));
}

export interface LeftOutList extends LeftOutGroup {
  members: { id: string; name: string; email: string; mobile: string }[];
  /** How many more there are than the names listed. */
  more: number;
}

/** "See who": each reason with the first names (A to Z), up to `perReason` of them. */
export async function listLeftOut(filter: MemberFilter, blast: Blast, perReason = 50): Promise<LeftOutList[]> {
  if (!blast.sendEmail && !blast.sendSms) return [];
  const base = leftOutWhere(filter, blast);
  const [rows, bookedIds] = await Promise.all([
    prisma.member.findMany({
      where: base,
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, email: true, mobile: true,
        marketingOptIn: true, awaitingPasswordSetup: true, emailVerified: true, emailBounced: true, mobileVerified: true, contactMethod: true,
      },
    }),
    blast.excludeBooked
      ? prisma.member.findMany({ where: { AND: [base, { NOT: notBookedWhere(blast) }] }, select: { id: true } }).then((r) => new Set(r.map((m) => m.id)))
      : Promise.resolve(new Set<string>()),
  ]);
  const groups = new Map<string, LeftOutList>();
  for (const r of rows) {
    const key = leftOutReason({ ...r, hasMobile: r.mobile.trim() !== '', booked: bookedIds.has(r.id) }, blast) ?? 'other';
    const g = groups.get(key) ?? { key, count: 0, members: [], more: 0 };
    g.count += 1;
    if (g.members.length < perReason) g.members.push({ id: r.id, name: r.name, email: r.email, mobile: r.mobile });
    g.more = g.count - g.members.length;
    groups.set(key, g);
  }
  return sortLeftOut([...groups.values()]);
}
