/**
 * One-line venue description for emails, SMS and list screens.
 *
 * Events used to hold a single free-text `venue` string that mixed name and
 * address together ("Sheaf Hotel, Double Bay"). Now that they're separate
 * columns, everywhere that used to print that one string needs to rejoin
 * them the same way — hence one helper rather than the same `[a, b].join()`
 * repeated across a dozen call sites.
 *
 * Address is optional, so a venue with only a name still reads correctly.
 */
export function venueLine(venue: { name: string; address?: string | null }): string {
  return venue.address ? `${venue.name}, ${venue.address}` : venue.name;
}

/**
 * Multi-line venue block for the blast "event details" field, matching the
 * layout Gil asked for:
 *
 *   GG Bar
 *   23 Walker St, North Sydney
 *   (02) 9955 1234
 *   ggbar.com.au
 *
 * Blank fields are dropped rather than left as empty lines.
 */
export function venueBlock(venue: {
  name: string;
  address?: string | null;
  phone?: string | null;
  websiteUrl?: string | null;
}): string {
  return [venue.name, venue.address, venue.phone, venue.websiteUrl]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Venues are typed by hand, so "ggbar.com.au" is as likely as a full URL.
 * An href without a scheme is treated as a relative path by the browser and
 * would navigate to /admin/ggbar.com.au, so add one when it's missing.
 */
export function venueHref(websiteUrl: string): string {
  return /^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`;
}
