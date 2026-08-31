// Age as of today, accounting for whether this year's birthday has
// happened yet — not just a year subtraction. Shared by registration
// (18+ check) and event booking (age-range check) so both agree on the
// same definition of "age".
export function calculateAge(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

/**
 * How far outside an event's stated age range a member can be and still have
 * that event suggested to them on the events page.
 *
 * Gil's wording: "based on 10 years above below age range" — so a 35-year-old
 * is shown events for 25-35 and for 40-50, but not 50-65.
 */
export const AGE_SUGGESTION_MARGIN = 10;

/**
 * Whether an event should appear under "other upcoming events you may be
 * interested in" for a member of this age.
 *
 * DELIBERATELY WIDER than the booking rule. api/events/[eventId]/book enforces
 * the event's exact range (age < ageMin || age > ageMax is rejected), so some
 * suggested events will be refused at booking. That is intended: this list
 * answers "what's on that's roughly for me", not "what can I book". Narrowing
 * it to the exact range would make the section identical to a plain filter and
 * lose the client's ±10 intent.
 */
export function suitsAge(event: { ageMin: number; ageMax: number }, age: number): boolean {
  return age >= event.ageMin - AGE_SUGGESTION_MARGIN && age <= event.ageMax + AGE_SUGGESTION_MARGIN;
}
