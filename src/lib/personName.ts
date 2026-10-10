/**
 * Does a typed name look like a person's name? Shared by every form that
 * takes one: sign-up, a friend's details when booking, the friend's own
 * "Welcome to FastMatch" form, Tell A Friend, Edit profile and the admin's
 * member forms. Pure, so the event page can mark the box as the member types.
 *
 * Deliberately loose (any alphabet, spaces, apostrophes, hyphens, initials,
 * even digits): it only catches the slips that end up in emails' greetings,
 * such as an email address or a web link typed into the name box. A friend's
 * booking email once read "You're booked in, anna@example.comAnna Smith!".
 *
 * Returns the message to show, or null. An empty name is left to each form,
 * which already has its own wording for it.
 */
export function nameProblem(raw: string, whose: 'your' | 'their' | 'the member’s' = 'their'): string | null {
  const name = raw.trim();
  if (!name) return null;
  if (name.includes('@')) return `That looks like an email address. Please enter ${whose} name`;
  if (/https?:\/\/|www\./i.test(name)) return `That looks like a web address. Please enter ${whose} name`;
  if (!/\p{L}/u.test(name)) return `Please enter ${whose} name using letters`;
  if (name.length > 100) return 'Please use a shorter name';
  return null;
}

/** The same, as a sentence for forms whose messages end with a full stop. */
export function nameProblemSentence(raw: string, whose: 'your' | 'their' | 'the member’s' = 'their'): string | null {
  const p = nameProblem(raw, whose);
  return p ? `${p}.` : null;
}
