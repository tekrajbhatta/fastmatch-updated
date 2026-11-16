import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { agreementDates, agreementsOverlap, franchiseInputSchema, type FranchiseInput } from '@/lib/franchise';
import { discountDay, formatDiscountDay } from '@/lib/discountDates';
import { nameProblemSentence } from '@/lib/personName';

/**
 * Helpers for the Franchises API (src/lib/franchise.ts has the rules).
 */

export const FRANCHISEE_SELECT = {
  id: true, name: true, email: true, mobile: true, franchiseFrom: true, franchiseTill: true, createdAt: true,
  franchiseCities: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
} satisfies Prisma.MemberSelect;

type Row = Prisma.MemberGetPayload<{ select: typeof FRANCHISEE_SELECT }>;

/** One franchisee for the Franchises page: their dates as "YYYY-MM-DD" (Sydney days), and where they stand today. */
export function franchiseeView(f: Row, now: Date = new Date()) {
  const from = f.franchiseFrom!;
  const till = f.franchiseTill!;
  return {
    id: f.id, name: f.name, email: f.email, mobile: f.mobile,
    cities: f.franchiseCities,
    agreementFrom: discountDay(from),
    agreementTill: discountDay(till),
    status: now < from ? 'not-started' as const : now > till ? 'ended' as const : 'active' as const,
  };
}

type Checked =
  | { ok: true; input: FranchiseInput; franchiseFrom: Date; franchiseTill: Date }
  | { ok: false; status: number; error: string };

/**
 * The form, checked: its fields, the dates, the locations, an email no
 * other account uses (a member's included: a franchisee's login is its own
 * account, so they use another address for it), and each location free of
 * any other franchisee for those dates. `selfId`: the franchisee being
 * changed; a new one needs a password.
 */
export async function checkFranchise(body: unknown, selfId?: string): Promise<Checked> {
  const parsed = franchiseInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: parsed.error.issues[0]?.message ?? 'Please check the franchisee’s details.' };
  const input = parsed.data;
  const nameIssue = nameProblemSentence(input.name, 'their');
  if (nameIssue) return { ok: false, status: 400, error: nameIssue };
  if (!selfId && !input.password) return { ok: false, status: 400, error: 'Please choose a password for their login (at least 8 characters).' };
  const dates = agreementDates(input);
  if (!dates.ok) return { ok: false, status: 400, error: dates.error };

  const cityIds = [...new Set(input.cityIds)];
  const cities = await prisma.city.findMany({ where: { id: { in: cityIds } }, select: { id: true, name: true } });
  if (cities.length !== cityIds.length) return { ok: false, status: 400, error: 'Please choose valid locations.' };

  const sameEmail = await prisma.member.findUnique({ where: { email: input.email }, select: { id: true, isFranchisee: true } });
  if (sameEmail && sameEmail.id !== selfId) {
    return {
      ok: false, status: 409,
      error: sameEmail.isFranchisee
        ? `${input.email} is already another franchisee’s login.`
        : `${input.email} already has a FastMatch member account. A franchisee’s login is an account of its own, so please use another email address for it.`,
    };
  }

  // Each location has one franchisee at a time.
  const others = await prisma.member.findMany({
    where: { isFranchisee: true, ...(selfId ? { NOT: { id: selfId } } : {}), franchiseCities: { some: { id: { in: cityIds } } } },
    select: { name: true, franchiseFrom: true, franchiseTill: true, franchiseCities: { where: { id: { in: cityIds } }, select: { name: true } } },
  });
  const mine = { from: dates.franchiseFrom, till: dates.franchiseTill };
  const clash = others.find((o) => o.franchiseFrom && o.franchiseTill && agreementsOverlap(mine, { from: o.franchiseFrom, till: o.franchiseTill }));
  if (clash) {
    const where = clash.franchiseCities.map((c) => c.name).join(' and ');
    return {
      ok: false, status: 409,
      error: `${where} ${clash.franchiseCities.length === 1 ? 'is' : 'are'} already ${clash.name}’s from ${formatDiscountDay(clash.franchiseFrom!)} to ${formatDiscountDay(clash.franchiseTill!)}. A location has one franchisee at a time: change the dates or the locations.`,
    };
  }

  return { ok: true, input: { ...input, cityIds }, franchiseFrom: dates.franchiseFrom, franchiseTill: dates.franchiseTill };
}
