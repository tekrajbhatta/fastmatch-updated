import { namesCity } from './venue';
import { eventLabel } from './eventLabel';

/**
 * Browser-tab titles: "Log in | FastMatch", "Events | FastMatch admin".
 * Every section's title is given with its ending as a template too, because
 * a plain-text title stops the ending reaching the pages inside it (an event's
 * own page, a member's admin page).
 */
export const SITE_TITLE_TEMPLATE = '%s | FastMatch';
export const ADMIN_TITLE_TEMPLATE = '%s | FastMatch admin';
export const pageTitle = (title: string) => ({ default: title, template: SITE_TITLE_TEMPLATE });
export const adminTitle = (title: string) => ({ default: title, template: ADMIN_TITLE_TEMPLATE });

/**
 * An event's browser-tab title: its type, name and city — "Speed Dating,
 * 28-40 years, Sydney". Type and name as the emails name it (eventLabel:
 * the type is left out when the name already says it), and the city is left
 * out when the name already ends with it. Every page used to share one title.
 */
export function eventTitle(e: { name: string; theme: { name: string }; city: { name: string } }): string {
  const label = eventLabel(e);
  return namesCity(e.name.trim(), e.city.name) ? label : `${label}, ${e.city.name}`;
}
