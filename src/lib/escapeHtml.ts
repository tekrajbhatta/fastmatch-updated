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

/**
 * For typed text that goes into an email SUBJECT. A subject is plain text, so
 * it is NOT escaped (that would show "&amp;" in the inbox), but it is a
 * header: a line break in it is how an extra header (a Bcc, say) gets
 * smuggled into the message. Line breaks become a space.
 */
export function oneLine(text: string): string {
  return text.replace(/[\r\n]+/g, ' ');
}

/**
 * For a link someone typed (a blast's booking link, say) that goes into an
 * href in email HTML. Only an http(s) address gets through; javascript:,
 * data: and anything else, or anything that isn't a real URL, gives null, so
 * the caller can fall back or leave the link out. What does get through is
 * already attribute-escaped, so a stray quote can't close the attribute and
 * add one of its own. Don't escape it again.
 */
export function safeHref(url: string | null | undefined): string | null {
  const u = url?.trim();
  if (!u || !/^https?:\/\//i.test(u)) return null;
  try {
    new URL(u);
  } catch {
    return null;
  }
  return escapeHtml(u);
}

/**
 * The same, for an image's src. That may also be a path on this site
 * ("/api/uploads/…", which is what an upload's URL is when APP_URL isn't
 * set), but not "//host" or "/\host": browsers read both as another site,
 * and they drop tabs and line breaks first, hence no spaces or backslashes.
 */
export function safeSrc(url: string | null | undefined): string | null {
  const u = url?.trim();
  if (u && /^\/(?![/\\])[^\s\\]*$/.test(u)) return escapeHtml(u);
  return safeHref(u);
}
