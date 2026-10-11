/**
 * What an event's card on Upcoming Events shows beside the name, venue and
 * date: a picture and the opening of the description.
 */

/**
 * The card's picture: the event's own photo, or its venue's picture when the
 * event has none. Null when neither has one (the card then shows a plain
 * purple panel, so the cards in a row still line up).
 */
export function eventCardPhoto(event: { photoUrl?: string | null; venue: { imageUrl?: string | null } }): string | null {
  return event.photoUrl?.trim() || event.venue.imageUrl?.trim() || null;
}

/**
 * The card's text: the event's description, or null when it has none (blank
 * counts as none), so the card doesn't leave an empty gap. The card itself
 * cuts it off after three lines.
 */
export function eventCardBlurb(description: string | null | undefined): string | null {
  return description?.trim() || null;
}
