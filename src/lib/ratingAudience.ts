/**
 * Who a member sees and rates on the check-in list (Gil, 4 Oct). Each event
 * says, on the event form:
 *   - OPPOSITE_GENDER (the default): men see and rate the women, women the men;
 *   - EVERYONE: for same-sex or friendship nights;
 *   - NO_MATCHES: no check-in, no choosing and no results at all, for social
 *     days like a day at the races (Gil, Nov). Members just come along.
 * The list used to show everyone checked in, so members could rate their own
 * gender and two men or two women could come out as a "date" match.
 *
 * The same rule decides the list, which choices are accepted and which pairs
 * can match. No Prisma import: the event form uses the labels in the browser.
 */
export type RatingAudience = 'OPPOSITE_GENDER' | 'EVERYONE' | 'NO_MATCHES';
export type Gender = 'MALE' | 'FEMALE';

export const RATING_AUDIENCE_OPTIONS: { value: RatingAudience; label: string; hint: string }[] = [
  { value: 'OPPOSITE_GENDER', label: 'Opposite gender only', hint: 'Men see and rate the women, women the men.' },
  { value: 'EVERYONE', label: 'Everyone', hint: 'Everyone sees and rates everyone, for same-sex or friendship nights.' },
  { value: 'NO_MATCHES', label: 'No check-in or matches', hint: 'For social days like a day at the races: nobody checks in or chooses matches, and no results are worked out.' },
];

/**
 * An event with no check-in or matches (NO_MATCHES): its emails and pages
 * leave out check-in and choosing, the results job skips it, and its check-in
 * link only says there's none.
 */
export function noMatches(event: { ratingAudience: string }): boolean {
  return event.ratingAudience === 'NO_MATCHES';
}

/** What a member sees if they open such an event's check-in link anyway. */
export const NO_MATCHES_MEMBER_MESSAGE = 'There’s no check-in or choosing matches at this event. Just come along and enjoy it!';

/** The one line on the admin's event page instead of the check-in and results cards. */
export const NO_MATCHES_ADMIN_NOTE = 'No check-in or matches: members don’t check in or choose matches at this event, and no results are worked out.';

/** Whether someone of `from`'s gender sees, and may rate, someone of `to`'s. */
export function canRate(audience: RatingAudience, from: Gender, to: Gender): boolean {
  if (audience === 'NO_MATCHES') return false;
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
