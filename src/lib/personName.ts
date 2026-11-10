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

/**
 * Endings of web addresses, for spotting one typed without http:// or www.
 * ("bit.ly/claim", "evil-site.com.au"): a name reaches other people's inboxes
 * (a Tell A Friend invitation, a friend's booking, the results email), and
 * mail programs turn "something.com" into a link by themselves, so a name
 * holding one would be a link in an email that really is from FastMatch.
 *
 * The common ones and the ones scam links favour. Left out on purpose: short
 * endings that are also words or surnames written after an initial ("J.De
 * Villiers", "M.La Rue", "K.Al Masri", "T.To", "H.So", "A.In"), which
 * this rule must never catch.
 */
const WEB_ENDINGS = [
  'com', 'net', 'org', 'edu', 'gov', 'info', 'biz', 'xyz', 'app', 'site', 'online', 'link', 'click', 'top', 'shop',
  'store', 'live', 'club', 'vip', 'icu', 'buzz', 'website', 'page', 'tk', 'ml', 'cf', 'gq', 'ga', 'cc', 'ws', 'pw',
  'au', 'io', 'co', 'me', 'ly', 'ru', 'cn', 'uk', 'nz', 'us',
];

/**
 * Something that reads as a web address without http:// or www.:
 *   - two or more letters or digits, a dot, then one of the endings above,
 *     with no letter straight after it ("evil.com", "site.com.au",
 *     "bit.ly/x"). At least two before the dot, so an initial written
 *     against a surname ("H.Ly", "K.Au", "J.Co") is still a name;
 *   - or anything dotted followed by a slash ("evil.example/claim",
 *     "t.co/abc"): a path, which no name has.
 * A dot followed by a space ("St. John", "J. R. Smith") is never one, and
 * nor is a dotted name ("Jo.Anne", "Mary.Lou"), as their second part isn't
 * an ending.
 */
const BARE_WEB_ADDRESS = new RegExp(
  `[\\p{L}\\p{N}][\\p{L}\\p{N}-]*[\\p{L}\\p{N}]\\.(?:${WEB_ENDINGS.join('|')})(?![\\p{L}\\p{N}])|[\\p{L}\\p{N}-]+\\.[\\p{L}\\p{N}-]{2,}\\/`,
  'iu',
);

/** The longest name any form takes. */
const NAME_MAX = 100;

export function nameProblem(raw: string, whose: 'your' | 'their' | 'the member’s' = 'their'): string | null {
  const name = raw.trim();
  if (!name) return null;
  if (name.includes('@')) return `That looks like an email address. Please enter ${whose} name`;
  // BARE_WEB_ADDRESS only on a name of a sensible length: on a very long one
  // it could take a while, and that's refused as too long just below anyway.
  if (/https?:\/\/|www\./i.test(name) || (name.length <= NAME_MAX && BARE_WEB_ADDRESS.test(name))) {
    return `That looks like a web address. Please enter ${whose} name`;
  }
  if (!/\p{L}/u.test(name)) return `Please enter ${whose} name using letters`;
  if (name.length > NAME_MAX) return 'Please use a shorter name';
  return null;
}

/** The same, as a sentence for forms whose messages end with a full stop. */
export function nameProblemSentence(raw: string, whose: 'your' | 'their' | 'the member’s' = 'their'): string | null {
  const p = nameProblem(raw, whose);
  return p ? `${p}.` : null;
}

/**
 * A name as other attendees see it on the night: the first name and the
 * initial of the last ("Anna Smith" -> "Anna S."), on the check-in list and
 * the rating pop-up. Enough to tell people apart in the room, without handing
 * everyone there the full names of the people they met (who could then be
 * looked up). A mutual match still gets full names and contact details, in
 * the results email and on My Match History: that's what matching is for.
 *
 * One word stays as it is ("Anna", "Mary-Jane", "李小龙"). The initial is the
 * first letter of the last word that has one, so "Anna O'Neil" is "Anna O.",
 * "Anna de Souza" is "Anna S." and "Anna Smith -" is still "Anna S."; middle
 * names are left out. Extra spaces don't matter.
 */
export function shortName(full: string): string {
  const words = full.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words[0] ?? '';
  const [first, ...rest] = words;
  for (let i = rest.length - 1; i >= 0; i--) {
    const letter = rest[i].match(/\p{L}/u);
    if (letter) return `${first} ${letter[0].toUpperCase()}.`;
  }
  return first;
}
