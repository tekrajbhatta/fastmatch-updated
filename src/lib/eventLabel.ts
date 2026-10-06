/**
 * How emails and pages name an event: its type, then its name as the admin
 * typed it — "Speed dating, 28-40 years". Gil (Q18): "you are booked into
 * Professional Speed Dating 28 to 40 years on 23rd Nov at 7.30pm at Hangout
 * Bar". The name on its own is usually just the age range ("You're booked:
 * 28-40 years"), which doesn't say what the event is.
 *
 * The type is left out when the name already says it, since admins may type
 * the whole thing as the name ("Professional Speed Dating, 28 to 40 years").
 * That's checked word by word, ignoring case, punctuation, "and" and a
 * plural "s", so "Professionals speed dating" counts as said.
 *
 * No Prisma import: pages use it in the browser too.
 */
export function eventLabel(e: { name: string; theme: { name: string } }): string {
  const name = e.name.trim();
  const type = e.theme.name.trim();
  if (!name) return type;
  return !type || nameSaysType(name, type) ? name : `${type}, ${name}`;
}

/** Lower case, split into words, without "and" or a plural "s" ("Lovers" = "lover"). */
function words(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && w !== 'and')
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
}

/** Every word of the type is somewhere in the name. */
function nameSaysType(name: string, type: string): boolean {
  const inName = new Set(words(name));
  const typeWords = words(type);
  return typeWords.length > 0 && typeWords.every((w) => inName.has(w));
}
