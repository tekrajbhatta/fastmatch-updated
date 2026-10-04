/**
 * Where to go after logging in, from a `?next=` that arrived in the URL — so
 * anyone can write it. Only a page on this site is followed; anything else
 * gives `fallback`.
 *
 * Checking that it starts with "/" isn't enough: browsers also read "//host",
 * "/\host" and "/<tab>/host" as another site (they treat "\" like "/" and
 * drop tabs and line breaks), so a link to /login?next=/\evil.example would
 * bounce a member off-site straight after they typed their password. Instead
 * the value is resolved the way the browser will, and kept only if it lands
 * on this site.
 */
export function safeNext(next: string | null | undefined, fallback: string, origin: string): string {
  if (!next || !next.startsWith('/')) return fallback;
  try {
    const url = new URL(next, origin);
    if (url.origin !== new URL(origin).origin) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
