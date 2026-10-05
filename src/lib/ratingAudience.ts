/**
 * Who a member sees and rates on the check-in list (Gil, 4 Oct). Each event
 * says, on the event form:
 *   - OPPOSITE_GENDER (the default): men see and rate the women, women the men;
 *   - EVERYONE: for same-sex or friendship nights.
 * The list used to show everyone checked in, so members could rate their own
 * gender and two men or two women could come out as a "date" match.
 *
 * The same rule decides the list, which choices are accepted and which pairs
 * can match. No Prisma import: the event form uses the labels in the browser.
 */
export type RatingAudience = 'OPPOSITE_GENDER' | 'EVERYONE';
export type Gender = 'MALE' | 'FEMALE';

export const RATING_AUDIENCE_OPTIONS: { value: RatingAudience; label: string; hint: string }[] = [
  { value: 'OPPOSITE_GENDER', label: 'Opposite gender only', hint: 'Men see and rate the women, women the men.' },
  { value: 'EVERYONE', label: 'Everyone', hint: 'Everyone sees and rates everyone, for same-sex or friendship nights.' },
];

/** Whether someone of `from`'s gender sees, and may rate, someone of `to`'s. */
export function canRate(audience: RatingAudience, from: Gender, to: Gender): boolean {
  return audience === 'EVERYONE' || from !== to;
}

/** Whether a pair can match: each must be someone the other could rate. */
export function canMatch(audience: RatingAudience, a: Gender, b: Gender): boolean {
  return canRate(audience, a, b) && canRate(audience, b, a);
}

/** "5 women checked in", "5 men checked in", or "10 checked in" — who the list shows. */
export function rosterCountLabel(audience: RatingAudience, viewer: Gender | null | undefined, count: number): string {
  if (audience === 'OPPOSITE_GENDER' && viewer) {
    const plural = viewer === 'MALE' ? 'women' : 'men';
    const single = viewer === 'MALE' ? 'woman' : 'man';
    return `${count} ${count === 1 ? single : plural} checked in.`;
  }
  return `${count} checked in.`;
}
