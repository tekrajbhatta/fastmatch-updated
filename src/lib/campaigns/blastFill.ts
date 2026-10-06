import { venueBlock } from '../venue';
import { eventLabel } from '../eventLabel';

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

/**
 * "Book Now goes to" an event (Gil, item 19): the booking link becomes the
 * event's page; the subject and heading, only while still empty, become what
 * the event page's "Create blast for this event" puts there: the subject its
 * type and name, the heading its type (item 14: the event type in the blast).
 */
export function bookNowFill(
  e: { id: string; name: string; theme: { name: string } },
  origin: string,
  current: { subject: string; heading: string },
): { bookingLink: string; subject?: string; heading?: string } {
  return {
    bookingLink: `${origin.replace(/\/+$/, '')}/events/${e.id}`,
    ...(current.subject.trim() ? {} : { subject: eventLabel(e) }),
    ...(current.heading.trim() ? {} : { heading: e.theme.name }),
  };
}

/** The listed event a booking link already goes to, or ''. */
export function bookNowEventId(bookingLink: string, eventIds: string[]): string {
  const link = bookingLink.trim().replace(/\/+$/, '');
  return eventIds.find((id) => link.endsWith(`/events/${id}`)) ?? '';
}
