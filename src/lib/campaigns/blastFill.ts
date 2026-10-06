import { venueBlock } from '../venue';
import { eventLabel } from '../eventLabel';
import { timeZoneForCity } from '../timezone';
import { formatPrice } from '../price';

/**
 * What the blast form's pickers write into a blast. Copies, not references:
 * the blast then owns its text (see VenuePickerField). No Prisma import: the
 * forms run these in the browser.
 */

export interface VenueForBlast {
  name: string; address: string | null; phone: string | null; websiteUrl: string | null;
  imageUrl: string | null; logoUrl: string | null; description: string | null;
}

/**
 * "Fill from a venue": its name, address, phone and website go into Event
 * details; its description into Free text (Gil, item 1; it used to go under
 * the address, in Event details); its image becomes the photo; its logo goes
 * under the event details. Free text and the photo are left alone when the
 * venue has no description or image; the logo is always set, so a venue
 * without one clears the last venue's.
 */
export function venueFill(v: VenueForBlast): { eventDetailsText: string; freeText?: string; photoUrl?: string; venueLogoUrl: string } {
  const description = v.description?.trim();
  return {
    eventDetailsText: venueBlock(v),
    ...(description ? { freeText: description } : {}),
    ...(v.imageUrl ? { photoUrl: v.imageUrl } : {}),
    venueLogoUrl: v.logoUrl ?? '',
  };
}

/** The fields picking this venue would replace that already hold something, to ask first. */
export function venueWouldReplace(v: VenueForBlast, current: { eventDetailsText: string; freeText: string; photoUrl: string }): string[] {
  return [
    current.eventDetailsText.trim() ? 'event details' : null,
    v.description?.trim() && current.freeText.trim() ? 'free text' : null,
    v.imageUrl && current.photoUrl ? 'photo' : null,
  ].filter((x): x is string => x !== null);
}

/** An event in the blast form's pickers: what they fill in from it. */
export interface EventForBlast {
  id: string; name: string; startsAt: string | Date; cost: string | number;
  theme: { name: string }; city: { name: string };
  venue: { name: string; address?: string | null; phone?: string | null; websiteUrl?: string | null };
}

/**
 * A blast's Event details for an event: "When: Saturday 14 November, 7:30 pm",
 * "Where:" its venue, "Cost: $55". The event's own local time, as members
 * read it, not the admin's device clock.
 */
export function blastEventDetails(e: Omit<EventForBlast, 'id' | 'name' | 'theme'>): string {
  const date = new Date(e.startsAt);
  const timeZone = timeZoneForCity(e.city.name);
  const dateStr = date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone });
  const timeStr = date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone });
  return `When: ${dateStr}, ${timeStr}\nWhere: ${venueBlock(e.venue, e.city.name)}\nCost: ${formatPrice(e.cost)}`;
}

/**
 * "Book Now goes to" an event (Gil, item 19): the booking link becomes the
 * event's page; the subject, heading and event details, only while still
 * empty, become what the event page's "Create blast for this event" puts
 * there: the subject its type and name, the heading its type (item 14: the
 * event type in the blast), the details its date, venue and price (the user,
 * 6 Oct).
 */
export function bookNowFill(
  e: EventForBlast,
  origin: string,
  current: { subject: string; heading: string; eventDetailsText: string },
): { bookingLink: string; subject?: string; heading?: string; eventDetailsText?: string } {
  return {
    bookingLink: `${origin.replace(/\/+$/, '')}/events/${e.id}`,
    ...(current.subject.trim() ? {} : { subject: eventLabel(e) }),
    ...(current.heading.trim() ? {} : { heading: e.theme.name }),
    ...(current.eventDetailsText.trim() ? {} : { eventDetailsText: blastEventDetails(e) }),
  };
}

/** The listed event a booking link already goes to, or ''. */
export function bookNowEventId(bookingLink: string, eventIds: string[]): string {
  const link = bookingLink.trim().replace(/\/+$/, '');
  return eventIds.find((id) => link.endsWith(`/events/${id}`)) ?? '';
}
