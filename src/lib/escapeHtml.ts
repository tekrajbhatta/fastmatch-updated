/**
 * For text a member typed that goes into an HTML email. Without it, a
 * message containing "<" or "&" arrives mangled — or, deliberately, as
 * markup (a fake link, an image) inside an email Gil trusts.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
