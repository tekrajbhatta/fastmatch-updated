import { describe, it, expect } from 'vitest';
import { buildMatchesView, type ViewPerson } from '@/lib/matchesView';

/** The admin's "Matches and choices" (Gil Q12). */
const p = (id: string, badge: number, gender: 'MALE' | 'FEMALE'): ViewPerson => ({ id, badge, name: id, gender });
const ann = p('Ann', 2, 'FEMALE'), bob = p('Bob', 1, 'MALE'), cat = p('Cat', 4, 'FEMALE'), dan = p('Dan', 3, 'MALE');

const view = buildMatchesView({
  people: [ann, bob, cat, dan],
  ratings: [
    { raterId: 'Ann', ratedMemberId: 'Bob', choice: 'DATE' },
    { raterId: 'Bob', ratedMemberId: 'Ann', choice: 'DATE' },
    { raterId: 'Ann', ratedMemberId: 'Dan', choice: 'NO' },
    { raterId: 'Dan', ratedMemberId: 'Ann', choice: 'DATE' },
    { raterId: 'Cat', ratedMemberId: 'Dan', choice: 'FRIEND' },
    { raterId: 'Dan', ratedMemberId: 'Cat', choice: 'DATE' },
    { raterId: 'Ann', ratedMemberId: 'Ghost', choice: 'DATE' }, // not at the event: ignored
  ],
  matches: [
    { memberAId: 'Ann', memberBId: 'Bob', result: 'DATE' },
    { memberAId: 'Cat', memberBId: 'Dan', result: 'FRIEND' },
  ],
});
const row = (id: string) => view.rows.find((r) => r.id === id)!;
const names = (list: ViewPerson[]) => list.map((x) => x.name);

describe('buildMatchesView', () => {
  it('lists everyone by their number', () => {
    expect(view.rows.map((r) => r.badge)).toEqual([1, 2, 3, 4]);
  });

  it('shows what each person chose, and how others chose them', () => {
    expect(names(row('Ann').chose.DATE)).toEqual(['Bob']);
    expect(names(row('Ann').chose.NO)).toEqual(['Dan']);
    expect(names(row('Ann').chosenBy.DATE)).toEqual(['Bob', 'Dan']);
    expect(names(row('Dan').chosenBy.NO)).toEqual(['Ann']);
  });

  it('answers "why didn\'t I match?": Dan chose Ann as Date, but Ann chose No', () => {
    expect(names(row('Dan').chose.DATE)).toContain('Ann');
    expect(names(row('Dan').chosenBy.NO)).toEqual(['Ann']);
    expect(row('Dan').matches.DATE).toEqual([]);
  });

  it('pairs each match, lowest number first, and lists it on both people', () => {
    expect(view.pairs.DATE.map(([a, b]) => [a.name, b.name])).toEqual([['Bob', 'Ann']]);
    expect(view.pairs.FRIEND.map(([a, b]) => [a.name, b.name])).toEqual([['Dan', 'Cat']]);
    expect(names(row('Ann').matches.DATE)).toEqual(['Bob']);
    expect(names(row('Cat').matches.FRIEND)).toEqual(['Dan']);
  });

  it('ignores a choice about someone not at the event', () => {
    expect(names(row('Ann').chose.DATE)).not.toContain('Ghost');
  });
});
