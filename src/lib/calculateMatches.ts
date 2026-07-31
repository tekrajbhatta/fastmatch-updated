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

export async function calculateMatchesForEvent(eventId: string) {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });

  if (event.matchesCalculated) {
    return { alreadyCalculated: true, matchesCreated: 0 };
  }

  const ratings = await prisma.rating.findMany({ where: { eventId } });

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

function resolveMatch(a: Choice, b: Choice): MatchResult | null {
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
