import type { City, Event, EventTheme, Gender, Venue } from '@prisma/client';
import { eventAvailability } from './eventAvailability';

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
 *
 * `viewerGender` is the signed-in member's, if any: they're also told when
 * every place for their gender is taken, since they couldn't book it either.
 * A visitor who isn't signed in only learns whether the whole night is full.
 *
 * `booked` is places taken (src/lib/capacity.ts): paid bookings plus those
 * held by payment pages still open.
 */
export function toPublicEvent(e: EventWithRefs, booked: { men: number; women: number }, viewerGender?: Gender | null) {
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
    // Whether it can be booked, and if not why: the event page shows
    // "finished", "cancelled" or "not open" instead of the booking panel.
    availability: eventAvailability(e),
    // Every place, men's and women's together, taken.
    soldOut: booked.men + booked.women >= e.maxMen + e.maxWomen,
    // A women-only or men-only night (Gil, 7 Oct: one side's maximum is 0).
    onlyFor: onlyFor(e),
    // Every place for the signed-in member's gender taken (false when signed
    // out). Not on a night for the other gender only: that isn't "sold out"
    // for them, and the event page says who it's for.
    fullForYou: viewerGender === 'MALE' ? e.maxMen > 0 && booked.men >= e.maxMen : viewerGender === 'FEMALE' ? e.maxWomen > 0 && booked.women >= e.maxWomen : false,
  };
}

export type PublicEvent = ReturnType<typeof toPublicEvent>;

/** 'WOMEN' or 'MEN' for a one-gender night (the other side's maximum is 0), else null. */
export function onlyFor(e: { maxMen: number; maxWomen: number }): 'WOMEN' | 'MEN' | null {
  if (e.maxMen === 0 && e.maxWomen > 0) return 'WOMEN';
  if (e.maxWomen === 0 && e.maxMen > 0) return 'MEN';
  return null;
}
