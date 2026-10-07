import { prisma } from './prisma';
import type { MemberFilter } from './memberFilter';

/**
 * Searching members by mobile number, however it was typed (the review,
 * item 20). Numbers are saved as members typed them ("0412 345 678",
 * "+61412345678", "0412-345-678"), so searching "0412345678" used to find
 * only the one written exactly that way, and at the door Gil was told the
 * person wasn't registered. A search made only of phone characters is also
 * compared digits to digits, ignoring a leading 0 or +61; the members found
 * are added to what the search matches (buildMemberWhere).
 *
 * Server only (it asks the database): call it before buildMemberWhere.
 */
export async function withMobileMatches(filter: MemberFilter): Promise<MemberFilter> {
  const core = mobileSearchDigits(filter.search);
  if (!core) return filter;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM \`Member\` WHERE REGEXP_REPLACE(mobile, '[^0-9]', '') LIKE ${`%${core}%`} LIMIT 1000`;
  return { ...filter, mobileMatchIds: rows.map((r) => r.id) };
}

/**
 * The digits to look for when a search is a phone number (only phone
 * characters, at least 4 digits), without a leading 0 or 61 so every way of
 * writing it matches: "0412 345 678", "+61 412 345 678" and "412345678" all
 * give "412345678". Null for any other search.
 */
export function mobileSearchDigits(search: string | undefined): string | null {
  const s = search?.trim();
  if (!s || !/^[\d\s()+\-.]+$/.test(s)) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length < 4) return null;
  return digits.replace(/^(?:61|0)/, '');
}
