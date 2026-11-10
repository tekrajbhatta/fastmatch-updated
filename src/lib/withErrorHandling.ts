import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

/**
 * Paths another site's server is meant to POST to: Stripe's and Mailgun's
 * reports, and the one-click unsubscribe that mail programs (Gmail, Yahoo)
 * press on the member's behalf. None of them rely on the member's session.
 */
const CROSS_SITE_ALLOWED = [/^\/api\/stripe\/webhook\/?$/, /^\/api\/webhooks\//, /^\/api\/unsubscribe\/one-click\/?$/];

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The host:port of a URL, or null if it isn't one ("null", junk, unset). */
function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Should this request be refused because another website made the visitor's
 * browser send it? The session cookie is SameSite=Lax, which already keeps it
 * off most of these, but not all (a page on a sister subdomain counts as the
 * same "site", and older browsers ignore SameSite). So anything that changes
 * something (every method but GET/HEAD/OPTIONS) must come from a page on this
 * site:
 *   - Browsers send an Origin header with these. It must name this site:
 *     the host the request itself was sent to, or APP_URL's. (The request's
 *     own host matters for test servers reached on another port than the one
 *     APP_URL names.)
 *   - With no Origin, the browser's Sec-Fetch-Site saying "cross-site" or
 *     "same-site" is refused too. No header at all (a server, curl, a cron
 *     job) is let through: no browser, so no visitor's cookie to misuse.
 * The webhook paths above are exempt.
 *
 * Pure, so it can be tested on its own.
 */
export function isCrossSiteRequest(r: {
  method: string;
  pathname: string;
  origin: string | null;
  host: string | null;
  secFetchSite: string | null;
  appUrl?: string | null;
}): boolean {
  if (READ_ONLY_METHODS.has(r.method.toUpperCase())) return false;
  if (CROSS_SITE_ALLOWED.some((p) => p.test(r.pathname))) return false;
  if (r.origin != null) {
    const from = hostOf(r.origin);
    if (!from) return true; // "null" (a sandboxed frame, a file) or junk: not a page on this site
    const ownHost = r.host?.trim().toLowerCase() || null;
    return from !== ownHost && from !== hostOf(r.appUrl);
  }
  const site = r.secFetchSite?.toLowerCase();
  return site === 'cross-site' || site === 'same-site';
}

/**
 * What goes in the server log for an unexpected error. Prisma's own messages
 * quote the query they refused, values and all (a member's name, email,
 * mobile), and the logs are kept for weeks, so for those only the error's
 * kind, its code and the first line ("Invalid `prisma.member.update()`
 * invocation…") are logged. Anything else keeps its full stack.
 */
export function describeErrorForLog(err: unknown): unknown {
  if (err instanceof Prisma.PrismaClientValidationError || err instanceof Prisma.PrismaClientKnownRequestError) {
    const firstLine = err.message.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
    const code = err instanceof Prisma.PrismaClientKnownRequestError ? ` ${err.code}` : '';
    return `${err.name}${code}: ${firstLine}`;
  }
  return err;
}

/**
 * Wraps a route handler so a bad/missing ID (findUniqueOrThrow on a record
 * that doesn't exist — Prisma error P2025) returns a clean 404 instead of
 * an unhandled exception. Also catches anything else unexpected as a 500
 * with a safe message, rather than leaking a stack trace to the response.
 *
 * Every API route is wrapped in this, so it is also where requests sent from
 * another website are turned away (isCrossSiteRequest).
 */
export function withErrorHandling<T extends (req: NextRequest, ctx: any) => Promise<NextResponse>>(
  handler: T
): T {
  return (async (req: NextRequest, ctx: any) => {
    if (
      isCrossSiteRequest({
        method: req.method,
        pathname: req.nextUrl.pathname,
        origin: req.headers.get('origin'),
        host: req.headers.get('host'),
        secFetchSite: req.headers.get('sec-fetch-site'),
        appUrl: process.env.APP_URL,
      })
    ) {
      return NextResponse.json({ error: 'This request came from another site.' }, { status: 403 });
    }
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      console.error(describeErrorForLog(err));
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
  }) as T;
}
