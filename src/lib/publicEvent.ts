import type { City, Event, EventTheme, Venue } from '@prisma/client';

type EventWithRefs = Event & { theme: EventTheme; city: City; venue: Venue };

/**
 * What the public site may know about an event: what the pages show, and
 * whether it's sold out. Built field by field rather than by removing a few,
 * so a column added to Event or Venue later stays private unless it's added
 * here on purpose.
 *
 * Never included: expenses, the "Event confirmed" tick, the maximums or how
 * many men and women have booked (members mustn't see how full a night is,
 * and competitors mustn't see what it cost), the venue's phone and website,
 * and the admin's own flags (draft, visibility, status, series, matching).
 */
export function toPublicEvent(e: EventWithRefs, booked: { men: number; women: number }) {
  return {
    id: e.id,
    name: e.name,
    description: e.description,
    photoUrl: e.photoUrl,
    startsAt: e.startsAt,
    ageMin: e.ageMin,
    ageMax: e.ageMax,
    cost: e.cost,
    fastmatchDiscounts: e.fastmatchDiscounts,
    groupDiscounts: e.groupDiscounts,
    themeId: e.themeId,
    cityId: e.cityId,
    theme: { id: e.theme.id, name: e.theme.name },
    city: { id: e.city.id, name: e.city.name },
    venue: { id: e.venue.id, name: e.venue.name, address: e.venue.address, logoUrl: e.venue.logoUrl },
    // Every place, men's and women's together, taken by a paid booking.
    soldOut: booked.men + booked.women >= e.maxMen + e.maxWomen,
  };
}

export type PublicEvent = ReturnType<typeof toPublicEvent>;
