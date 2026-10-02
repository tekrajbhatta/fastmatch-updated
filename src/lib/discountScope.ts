import type { DiscountCode, Event } from '@prisma/client';

/**
 * Can this code be used on this event right now? It must be within its
 * dates and, when the admin has limited it, be for this event (the "Event"
 * field on the discount code form) and this event type. Whether the member
 * has already used it, and the event's own "FastMatch Discounts" switch, are
 * checked by the caller.
 */
export function discountAppliesTo(
  discount: Pick<DiscountCode, 'validFrom' | 'validTo' | 'scopeThemeId' | 'scopeEventId'>,
  event: Pick<Event, 'id' | 'themeId'>,
  now: Date,
): boolean {
  return (
    discount.validFrom <= now &&
    discount.validTo >= now &&
    (!discount.scopeThemeId || discount.scopeThemeId === event.themeId) &&
    (!discount.scopeEventId || discount.scopeEventId === event.id)
  );
}
