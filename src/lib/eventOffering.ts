/**
 * What an event's price includes (Gil, Nov: "Offerings", under the cost on
 * the event form). Members see it beside the price: on the events lists,
 * the event's page and a blast's event details. "No extras" shows nothing.
 *
 * No imports: the event forms and members' pages use it in the browser.
 */
export type EventOffering = 'NONE' | 'ONE_DRINK' | 'TWO_DRINKS' | 'FOOD' | 'FOOD_AND_DRINKS' | 'PRIZES';

export const OFFERING_VALUES = ['NONE', 'ONE_DRINK', 'TWO_DRINKS', 'FOOD', 'FOOD_AND_DRINKS', 'PRIZES'] as const;

/** Gil's wording, in his order. */
export const OFFERING_OPTIONS: { value: EventOffering; label: string }[] = [
  { value: 'NONE', label: 'No extras' },
  { value: 'ONE_DRINK', label: 'inc one drink' },
  { value: 'TWO_DRINKS', label: 'inc two drinks' },
  { value: 'FOOD', label: 'inc food' },
  { value: 'FOOD_AND_DRINKS', label: 'inc food and drinks' },
  { value: 'PRIZES', label: 'prizes and giveaways' },
];

/** What members see beside the price, or null for no extras. */
export function offeringLabel(offering: string | null | undefined): string | null {
  if (!offering || offering === 'NONE') return null;
  return OFFERING_OPTIONS.find((o) => o.value === offering)?.label ?? null;
}

/** "$49 · inc one drink", or just "$49". */
export function priceWithOffering(price: string, offering: string | null | undefined): string {
  const label = offeringLabel(offering);
  return label ? `${price} · ${label}` : price;
}
