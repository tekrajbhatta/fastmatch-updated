import { escapeHtml } from './escapeHtml';

/**
 * Where members write about an event: Gil's address, or the franchisee's for
 * an event in their location (src/lib/eventContact.ts finds it). Kept apart
 * from the database so the email templates stay plain functions.
 */
export const FASTMATCH_CONTACT_EMAIL = 'gil@fastmatch.com.au';

/** The address as a mailto link, escaped for an email's HTML. */
export function contactLink(email: string | null | undefined): string {
  const address = escapeHtml(email || FASTMATCH_CONTACT_EMAIL);
  return `<a href="mailto:${address}">${address}</a>`;
}
