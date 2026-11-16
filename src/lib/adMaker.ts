import { timeZoneForCity } from './timezone';

/**
 * Gil's Ad Maker (Nov): a page that turns an event into social media images
 * (Eventbrite, Facebook event, Meetup, Facebook/Instagram post), served to
 * staff at /admin/ad-maker (src/app/admin/ad-maker/route.ts). "Make an ad"
 * on an event opens it filled in from the event, as its developer notes
 * describe: the query string sets each line of the ad.
 *
 * Every line is sent, even the ones left as the "Event night" starting
 * point: the page remembers the last ad made in that browser, so a line not
 * sent would carry over from another event's ad (a past promotion's
 * discount code, say).
 */

type AdEvent = {
  startsAt: string | Date;
  ageMin: number;
  ageMax: number;
  maxMen: number;
  maxWomen: number;
  ratingAudience: string;
  theme: { name: string };
  venue: { name: string };
  city: { name: string };
};

/** "Wed 18 Nov, 7:30pm", on the event city's clock: as the Ad Maker's own example. */
export function adWhen(startsAt: string | Date, cityName: string): string {
  const at = new Date(startsAt);
  const timeZone = timeZoneForCity(cityName);
  const date = at.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone }).replace(',', '');
  const time = at.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone }).replace(/\s?(am|pm)/i, (m) => m.trim().toLowerCase());
  return `${date}, ${time}`;
}

/** The Ad Maker's address for this event. */
export function adMakerHref(event: AdEvent): string {
  // Speed dating: the most dates anyone has (one with each person on the
  // other side). Anything else (a day at the races, say) has no such line.
  const dates = event.ratingAudience === 'OPPOSITE_GENDER' ? Math.max(event.maxMen, event.maxWomen) : 0;
  const params = new URLSearchParams({
    head: event.theme.name,
    // Ages, venue, then the date and time on a second line.
    venue: `Ages ${event.ageMin}–${event.ageMax} · ${event.venue.name}\n${adWhen(event.startsAt, event.city.name)}`,
    sub: dates > 0 ? `Meet up to ${dates} singles, 5 minutes each.` : '',
    // The rest of the Ad Maker's "Event night" starting point.
    offerLabel: 'Limited spots available',
    offerText: 'Reserve your place now',
    code: '',
    book: 'Book now at fastmatch.com.au',
    img: '3',
  });
  return `/admin/ad-maker?${params.toString()}`;
}
