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
 * Whether a line already names the city at its end — "23 Walker St, North
 * Sydney", "1 George St, Sydney NSW 2000" — so it isn't added a second time
 * ("…, Sydney, Sydney"). Looks at the last comma-separated part, where the
 * suburb or city goes, for the city as whole words.
 */
export function namesCity(line: string, city: string): boolean {
  const c = city.trim().toLowerCase();
  if (!c) return true;
  const last = (line.split(',').pop() ?? '').trim().toLowerCase();
  const asText = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${asText}(\\s|$)`).test(last);
}

/** The venue's line with its city after it, unless the address already ends with it. For event pages and lists. */
export function venueLineWithCity(venue: { name: string; address?: string | null }, cityName?: string | null): string {
  const line = venueLine(venue);
  const city = cityName?.trim();
  return city && !namesCity(line, city) ? `${line}, ${city}` : line;
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
 *
 * With a city, it goes after the address ("23 Walker St, North Sydney,
 * Sydney"), or after the name when there's no address, and is left off when
 * that line already ends with it. (It used to be tacked onto the end of the
 * whole block, which is usually the website.)
 */
export function venueBlock(
  venue: {
    name: string;
    address?: string | null;
    phone?: string | null;
    websiteUrl?: string | null;
  },
  cityName?: string | null,
): string {
  const city = cityName?.trim();
  const withCity = (line: string | null | undefined) => {
    const l = line?.trim();
    return l && city && !namesCity(l, city) ? `${l}, ${city}` : l;
  };
  const address = venue.address?.trim();
  return [address ? venue.name : withCity(venue.name), withCity(address), venue.phone, venue.websiteUrl]
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
