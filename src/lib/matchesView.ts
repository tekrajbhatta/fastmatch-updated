/**
 * The admin's "Matches and choices" for one event (Gil, 4 Oct: "Yes I'd like
 * to see it"): who matched with whom, and everyone's Date / Friend / No
 * choices — what each person chose, and how others chose them — so a
 * member's question about their results can be checked. The admin couldn't
 * see any of it before.
 *
 * Pure (no Prisma), so it can be tested without a database.
 */
export type ChoiceKind = 'DATE' | 'FRIEND' | 'NO';
export const CHOICE_KINDS: ChoiceKind[] = ['DATE', 'FRIEND', 'NO'];

export interface ViewPerson { id: string; badge: number; name: string; gender: 'MALE' | 'FEMALE' }

export interface PersonRow extends ViewPerson {
  /** Whom they chose, by choice. */
  chose: Record<ChoiceKind, ViewPerson[]>;
  /** Who chose them, by choice. */
  chosenBy: Record<ChoiceKind, ViewPerson[]>;
  /** Their matches (only once the results are worked out). */
  matches: { DATE: ViewPerson[]; FRIEND: ViewPerson[] };
}

export interface MatchesView {
  rows: PersonRow[];
  pairs: { DATE: [ViewPerson, ViewPerson][]; FRIEND: [ViewPerson, ViewPerson][] };
}

const byBadge = (a: ViewPerson, b: ViewPerson) => a.badge - b.badge || a.name.localeCompare(b.name);
const emptyChoices = (): Record<ChoiceKind, ViewPerson[]> => ({ DATE: [], FRIEND: [], NO: [] });

export function buildMatchesView(input: {
  people: ViewPerson[];
  ratings: { raterId: string; ratedMemberId: string; choice: ChoiceKind }[];
  matches: { memberAId: string; memberBId: string; result: 'DATE' | 'FRIEND' }[];
}): MatchesView {
  const people = [...input.people].sort(byBadge);
  const byId = new Map(people.map((p) => [p.id, p]));
  const rows = new Map<string, PersonRow>(
    people.map((p) => [p.id, { ...p, chose: emptyChoices(), chosenBy: emptyChoices(), matches: { DATE: [], FRIEND: [] } }]),
  );

  for (const r of input.ratings) {
    const rater = byId.get(r.raterId);
    const rated = byId.get(r.ratedMemberId);
    if (!rater || !rated) continue;
    rows.get(rater.id)!.chose[r.choice].push(rated);
    rows.get(rated.id)!.chosenBy[r.choice].push(rater);
  }

  const pairs: MatchesView['pairs'] = { DATE: [], FRIEND: [] };
  for (const m of input.matches) {
    const a = byId.get(m.memberAId);
    const b = byId.get(m.memberBId);
    if (!a || !b) continue;
    const pair = [a, b].sort(byBadge) as [ViewPerson, ViewPerson];
    pairs[m.result].push(pair);
    rows.get(a.id)!.matches[m.result].push(b);
    rows.get(b.id)!.matches[m.result].push(a);
  }

  for (const row of rows.values()) {
    for (const k of CHOICE_KINDS) { row.chose[k].sort(byBadge); row.chosenBy[k].sort(byBadge); }
    row.matches.DATE.sort(byBadge);
    row.matches.FRIEND.sort(byBadge);
  }
  pairs.DATE.sort((x, y) => byBadge(x[0], y[0]));
  pairs.FRIEND.sort((x, y) => byBadge(x[0], y[0]));
  return { rows: [...rows.values()], pairs };
}
