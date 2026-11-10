/**
 * Moving the site from 5minutedating.com.au to fastmatch.com.au.
 *
 * Most links follow APP_URL by themselves (emails, texts, Stripe, unsubscribe
 * links), but some addresses were SAVED with the old one: uploaded pictures
 * are stored as `${APP_URL}/api/uploads/<file>`, a blast's Book Now link as
 * `<site>/events/<id>`, and an admin may have typed the address into a blast's
 * or an event's text. src/scripts/rewriteSiteAddress.ts rewrites those with
 * rewriteOldAddress() below, once, after the switch.
 */

export const OLD_HOST = '5minutedating.com.au';
export const NEW_ORIGIN = 'https://fastmatch.com.au';
export const NEW_HOST = 'fastmatch.com.au';

/**
 * Any spelling of the old address with http(s):// in front (and www. or not),
 * when the host name ends there: "https://5minutedating.com.au.other.example"
 * is another site and is left alone (a full stop ending a sentence is fine).
 */
const OLD_WITH_SCHEME = /https?:\/\/(?:www\.)?5minutedating\.com\.au(?![\w-]|\.[\w-])/gi;

/**
 * The old address written without http(s):// ("Book now: 5minutedating.com.au/events"
 * in a text). Not when it is part of something else: an email address
 * ("gil@5minutedating.com.au" stays as it is, as that mailbox may not exist
 * on the new domain) or a longer host name ("mg.5minutedating.com.au").
 */
const OLD_BARE = /(?<![@\w.-])(?:www\.)?5minutedating\.com\.au(?![\w-]|\.[\w-])/gi;

/** The text with every old site address changed to the new one; the same text when there is none. */
export function rewriteOldAddress(text: string): string {
  return text.replace(OLD_WITH_SCHEME, NEW_ORIGIN).replace(OLD_BARE, NEW_HOST);
}

/** Does this text still mention the old address in a form rewriteOldAddress changes? */
export function mentionsOldAddress(text: string | null | undefined): boolean {
  return !!text && rewriteOldAddress(text) !== text;
}

/**
 * Every column that can hold a site address: pictures and links the site
 * saved with the address it had at the time, and the free text an admin
 * writes, where they may have typed it. Table and column names exactly as in
 * the database (prisma/schema.prisma). Anything else that mentions the old
 * address (a member's email address, say) is reported by the script and
 * never changed.
 */
export const ADDRESS_COLUMNS: { table: string; columns: string[] }[] = [
  { table: 'Event', columns: ['photoUrl', 'description'] },
  { table: 'Venue', columns: ['logoUrl', 'imageUrl', 'websiteUrl', 'description'] },
  {
    table: 'Campaign',
    columns: ['bookingLink', 'photoUrl', 'bannerImageUrl', 'venueLogoUrl', 'subject', 'heading', 'freeText', 'eventDetailsText', 'emailBody', 'smsBody'],
  },
  {
    table: 'CampaignTemplate',
    columns: ['bookingLink', 'photoUrl', 'bannerImageUrl', 'subject', 'heading', 'freeText', 'eventDetailsText', 'emailBody', 'smsBody'],
  },
];
