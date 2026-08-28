import { NextRequest, NextResponse } from 'next/server';

/**
 * Redirects logged-out visitors away from member-only pages, to
 * /login?next=<where they were going>.
 *
 * Before this, every protected page hand-rolled its own client-side check and
 * each did it differently — some showed "Please log in", some rendered the
 * full form and only failed on submit with a raw "Not authenticated", and
 * /account/unsubscribe told anonymous visitors they had been unsubscribed
 * when the API had in fact rejected the request. Gating here means the page
 * never renders for a logged-out visitor at all.
 *
 * THIS IS ROUTING, NOT AUTHORISATION. It only checks that a session cookie is
 * PRESENT — it does not verify the signature, because middleware runs on the
 * Edge runtime where `jsonwebtoken` (Node crypto) is unavailable. Someone can
 * therefore set a junk fm_session cookie and reach these pages; they still
 * get nothing, because every API route independently verifies the token via
 * getSessionMember(). The pages also handle a rejected session gracefully.
 * The real security boundary is, and stays, the API layer.
 */

// Prefix match, so /account also covers /account/edit-profile etc.
const PROTECTED_PREFIXES = ['/account', '/matches', '/verify-mobile'];

// Per-event member-only pages: /events/<id>/checkin and /events/<id>/booked.
// The events list and an event's public detail page stay open — browsing is
// deliberately anonymous, and only booking requires an account.
const PROTECTED_EVENT_SUBPAGES = /^\/events\/[^/]+\/(checkin|booked)\/?$/;

function isProtected(pathname: string): boolean {
  if (PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  return PROTECTED_EVENT_SUBPAGES.test(pathname);
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (!isProtected(pathname)) return NextResponse.next();
  if (req.cookies.get('fm_session')?.value) return NextResponse.next();

  const login = new URL('/login', req.url);
  // Carry the original destination (including any query string) so login can
  // return them to it — matches the ?next= handling in login/page.tsx.
  login.searchParams.set('next', pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except API routes, Next's own assets, and static files. API
  // routes are excluded deliberately: they must answer 401 so the client can
  // react (the booking button turns a 401 into its own login redirect), not
  // be handed a 307 to an HTML page.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|logo.png|photos).*)'],
};
