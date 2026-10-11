/**
 * An event with no photo or no description of its own shows its venue's
 * instead, on its card in Upcoming Events and on its own page. (Picking a
 * venue on the event form copies both into the event, where the admin can
 * change or clear them for that one event; this covers the events left
 * without.)
 */

/**
 * The picture shown for an event, on its card in Upcoming Events and on its
 * own page: the event's own photo, or its venue's picture when the event has
 * none. Null when neither has one (the card then shows a plain purple panel,
 * so the cards in a row still line up; the event's page shows no picture).
 */
export function eventPhoto(event: { photoUrl?: string | null; venue: { imageUrl?: string | null } }): string | null {
  return event.photoUrl?.trim() || event.venue.imageUrl?.trim() || null;
}

/**
 * The text shown for an event, on its card in Upcoming Events and on its own
 * page: the event's own description, or its venue's when the event has none.
 * Null when neither has one (blank counts as none), so neither place leaves
 * an empty gap. The card cuts it off after three lines; the event's page
 * shows all of it, so what a card starts can be read in full there.
 */
export function eventDescription(event: { description?: string | null; venue: { description?: string | null } }): string | null {
  return event.description?.trim() || event.venue.description?.trim() || null;
}
