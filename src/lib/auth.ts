import { cache } from 'react';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from './prisma';
import { readSessionToken, sessionStillValid, signSessionToken, SESSION_DAYS } from './tokens';

// Admin accounts are just Members with isAdmin = true (kept simple; a
// separate admin table isn't needed for a single-operator business).
// isAdmin is not exposed on any public API response.

// A session is tied to the member's current password (see tokens.ts): pass
// the member as stored, AFTER any password change, so this device stays
// logged in while every other one is signed out.
export function signSession(member: { id: string; passwordHash: string }): string {
  return signSessionToken(member);
}

/** The fm_session cookie's settings, the same wherever a session is issued. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * SESSION_DAYS,
};

// The session token, from the cookie only. (An "Authorization: Bearer"
// header was also accepted; nothing in the site used it, and it let any
// emailed link's token be replayed as a login without a browser.)
function getTokenFromRequest(req: NextRequest): string | null {
  return req.cookies.get('fm_session')?.value ?? null;
}

/**
 * The logged-in member for this token, or null. Only a session token counts
 * (never an unsubscribe, email-confirmation, set-password or reset link), and
 * not once the member's password has changed since it was issued.
 */
async function memberForSessionToken(token: string | null | undefined) {
  if (!token) return null;
  const claims = readSessionToken(token);
  if (!claims) return null; // expired/invalid/not a session — treat as logged out, not an error
  const member = await prisma.member.findUnique({ where: { id: claims.memberId } });
  if (!member || !sessionStillValid(claims, member)) return null;
  return member;
}

export async function getSessionMember(req: NextRequest) {
  return memberForSessionToken(getTokenFromRequest(req));
}

export async function requireAdmin(req: NextRequest) {
  const member = await getSessionMember(req);
  if (!member || !member.isAdmin) return null;
  return member;
}

// Server-component-friendly variant — RSCs don't have a NextRequest, they
// read cookies via next/headers instead. Same session-cookie logic as
// getSessionMember, just a different way of getting the token.
// cache() memoises this for the duration of a single request render, so the
// root layout, the admin layout and a page can each ask "who is this?"
// without producing three identical lookups per page view. It is per-request
// only — nothing is shared between requests or users.
export const getCurrentMember = cache(async () => {
  // Next 15 made cookies() async (it returns a Promise); in Next 14 it was
  // synchronous. This must stay awaited while the project is on Next 15.
  return memberForSessionToken((await cookies()).get('fm_session')?.value);
});
