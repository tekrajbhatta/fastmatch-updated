/**
 * Core match calculation for fastmatch.com.au.
 *
 * Unlike FastmatchLive's simple mutual yes/no matching, this app has three
 * possible ratings (No / Friend / Date), which combine as:
 *   - Mutual DATE          -> date match
 *   - One DATE + one FRIEND -> friend match
 *   - Anything else         -> no match
 *
 * Runs automatically at midnight after the event via a scheduled job
 * (see src/scripts/calculateMatches.ts), or manually via the host's
 * "Close event now & calculate early" action in admin.
 */

import { Choice, MatchResult } from '@prisma/client';
import { prisma } from './prisma';
import { canMatch, type Gender } from './ratingAudience';

export async function calculateMatchesForEvent(eventId: string) {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });

  if (event.matchesCalculated) {
    return { alreadyCalculated: true, matchesCreated: 0 };
  }

  // Only between people still on the night: a confirmed, checked-in booking,
  // the same rule as for choosing (the ratings route). Someone Gil cancelled,
  // refunded or unticked after they'd made choices (asked to leave, say)
  // isn't matched, so nobody gets their contact details, nor they anyone's.
  const present = new Set(
    (await prisma.booking.findMany({ where: { eventId, status: 'CONFIRMED', checkedIn: true }, select: { memberId: true } }))
      .map((b) => b.memberId),
  );
  const ratings = (await prisma.rating.findMany({ where: { eventId } }))
    .filter((r) => present.has(r.raterId) && present.has(r.ratedMemberId));
  // On an "Opposite gender only" night (the default), two men or two women
  // never match, whatever was chosen (choices sent before the setting
  // existed, say). src/lib/ratingAudience.ts.
  const people = new Set(ratings.flatMap((r) => [r.raterId, r.ratedMemberId]));
  const genderOf = new Map<string, Gender>(
    (await prisma.member.findMany({ where: { id: { in: [...people] } }, select: { id: true, gender: true } })).map((m) => [m.id, m.gender]),
  );

  // Build a lookup: ratings[raterId][ratedMemberId] = choice
  const lookup = new Map<string, Map<string, Choice>>();
  for (const r of ratings) {
    if (!lookup.has(r.raterId)) lookup.set(r.raterId, new Map());
    lookup.get(r.raterId)!.set(r.ratedMemberId, r.choice);
  }

  // Every unique pair that rated each other in either direction
  const pairKeys = new Set<string>();
  for (const r of ratings) {
    const [a, b] = [r.raterId, r.ratedMemberId].sort();
    pairKeys.add(`${a}::${b}`);
  }

  const matchesToCreate: { memberAId: string; memberBId: string; result: MatchResult }[] = [];

  for (const key of pairKeys) {
    const [memberAId, memberBId] = key.split('::');
    const aChoice = lookup.get(memberAId)?.get(memberBId);
    const bChoice = lookup.get(memberBId)?.get(memberAId);

    if (!aChoice || !bChoice) continue; // one side never rated the other — no match
    const [aGender, bGender] = [genderOf.get(memberAId), genderOf.get(memberBId)];
    if (!aGender || !bGender || !canMatch(event.ratingAudience, aGender, bGender)) continue;

    const result = resolveMatch(aChoice, bChoice);
    if (result) {
      matchesToCreate.push({ memberAId, memberBId, result });
    }
  }

  await prisma.$transaction([
    ...matchesToCreate.map((m) =>
      prisma.match.upsert({
        where: {
          eventId_memberAId_memberBId: { eventId, memberAId: m.memberAId, memberBId: m.memberBId },
        },
        create: { eventId, ...m },
        update: { result: m.result },
      })
    ),
    prisma.event.update({
      where: { id: eventId },
      data: { matchesCalculated: true, matchesCalculatedAt: new Date() },
    }),
  ]);

  return { alreadyCalculated: false, matchesCreated: matchesToCreate.length };
}

// Exported so src/lib/__tests__/calculateMatches.test.ts can assert the rule
// directly without needing a database.
export function resolveMatch(a: Choice, b: Choice): MatchResult | null {
  if (a === 'DATE' && b === 'DATE') return 'DATE';
  if (
    (a === 'DATE' && b === 'FRIEND') ||
    (a === 'FRIEND' && b === 'DATE') ||
    (a === 'FRIEND' && b === 'FRIEND')
  ) {
    return 'FRIEND';
  }
  return null; // any NO involved -> no match
}
