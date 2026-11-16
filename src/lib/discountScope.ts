import type { DiscountCode, Event } from '@prisma/client';

/**
 * Can this code be used on this event right now? It must be within its
 * dates and, when the admin has limited it, be for this event (the "Event"
 * field on the discount code form), this event type and one of these
 * locations ("Locations": a franchisee's codes only work in their own,
 * src/lib/discountLocations.ts). Whether the member has already used it, and
 * the event's own "FastMatch Discounts" switch, are checked by the caller.
 */
export function discountAppliesTo(
  discount: Pick<DiscountCode, 'validFrom' | 'validTo' | 'scopeThemeId' | 'scopeEventId'> & { scopeCities?: { id: string }[] },
  event: Pick<Event, 'id' | 'themeId'> & { cityId?: string },
  now: Date,
): boolean {
  const cities = discount.scopeCities ?? [];
  return (
    discount.validFrom <= now &&
    discount.validTo >= now &&
    (!discount.scopeThemeId || discount.scopeThemeId === event.themeId) &&
    (!discount.scopeEventId || discount.scopeEventId === event.id) &&
    (cities.length === 0 || cities.some((c) => c.id === event.cityId))
  );
}
