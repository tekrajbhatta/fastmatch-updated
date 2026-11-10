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
    const path = url.pathname + url.search + url.hash;
    // Resolving can itself produce "//host": "/.//evil.example",
    // "/..//evil.example" and "/%2e//evil.example" all come out as
    // "//evil.example", which is on this site only until it's followed — the
    // browser then reads it as another site. Never hand one of those back.
    if (path.startsWith('//') || path.startsWith('/\\')) return fallback;
    return path;
  } catch {
    return fallback;
  }
}
