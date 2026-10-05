import { namesCity } from './venue';

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
 * 28-40 years, Sydney". The type is left out when the name already says it
 * (admins may type "Professional Speed Dating, 28 to 40 years"), and the
 * city when the name already ends with it. Every page used to share one title.
 */
export function eventTitle(e: { name: string; theme: { name: string }; city: { name: string } }): string {
  const name = e.name.trim();
  const type = e.theme.name.trim();
  const parts = type && !name.toLowerCase().includes(type.toLowerCase()) ? [type, name] : [name];
  return namesCity(name, e.city.name) ? parts.join(', ') : [...parts, e.city.name].join(', ');
}
