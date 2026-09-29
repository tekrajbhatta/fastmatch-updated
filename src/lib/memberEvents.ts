/**
 * Shared by the member events table on Upcoming Events and My Match History,
 * both laid out like the old site's: the events you're booked into first,
 * then everything else coming up.
 */
export interface TableEvent {
  id: string;
  startsAt: string;
  ageMin: number;
  ageMax: number;
  cost: string | number;
  bookedByMe: boolean;
  cityId: string;
}

/**
 * The "Profile Match" tick: the event's age range includes the member's age
 * — i.e. it's an event they can book. Nothing to judge without an age.
 */
export function isProfileMatch(event: { ageMin: number; ageMax: number }, age: number | null): boolean {
  return age !== null && age >= event.ageMin && age <= event.ageMax;
}

/**
 * Booked events (from any city — you're going to them wherever they are)
 * first, soonest first; then the rest of the chosen city's events, soonest
 * first. cityId null = every location.
 */
export function orderForMember<T extends TableEvent>(events: readonly T[], cityId: string | null): T[] {
  const byDate = (a: T, b: T) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  const booked = events.filter((e) => e.bookedByMe).sort(byDate);
  const rest = events.filter((e) => !e.bookedByMe && (cityId === null || e.cityId === cityId)).sort(byDate);
  return [...booked, ...rest];
}
