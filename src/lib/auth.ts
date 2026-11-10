import { cache } from 'react';
import type { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { prisma } from './prisma';
import { readSessionToken, sessionStillValid, signSessionToken, signValue, signatureMatches, SESSION_DAYS } from './tokens';

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

// ---- "this browser has logged in to this account" (the fm_device cookie) ----
//
// Logging in is limited per account from ANY address (LIMITS.loginEmail), so
// passwords can't be guessed from many machines at once. That also let a
// stranger lock someone out — Gil included — by typing wrong passwords for
// their email from a handful of addresses. So a browser that has logged in to
// the account before carries fm_device, and is let past that one limit (the
// per-address limits still apply to it). It is set wherever a session starts
// after the password was typed in that browser, and stays after logging out:
// it isn't a login, only "this browser has been trusted before".
//
// The value is "<memberId>.<signature>" for each account used in this browser
// (a shared computer: a few at most), newest first, joined by "~". Only the
// site can make the signature (src/lib/tokens.ts, signValue), so it can't be
// made up for someone else's account.

export const DEVICE_COOKIE = 'fm_device';
const DEVICE_LABEL = 'device';
/** Accounts one browser remembers (a household's shared computer). */
const DEVICE_ACCOUNTS_MAX = 5;

export const DEVICE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
};

/** The accounts in an fm_device cookie whose signatures are the site's own. */
function deviceAccounts(cookie: string | null | undefined): string[] {
  if (!cookie || cookie.length > 1000) return [];
  const ids: string[] = [];
  for (const entry of cookie.split('~').slice(0, DEVICE_ACCOUNTS_MAX)) {
    const dot = entry.lastIndexOf('.');
    if (dot < 1) continue;
    const memberId = entry.slice(0, dot);
    if (signatureMatches(DEVICE_LABEL, memberId, entry.slice(dot + 1)) && !ids.includes(memberId)) ids.push(memberId);
  }
  return ids;
}

/** Has this browser logged in to this account before? */
export function deviceKnowsMember(cookie: string | null | undefined, memberId: string): boolean {
  return deviceAccounts(cookie).includes(memberId);
}

/** The fm_device value once this account is added (first) to what the browser already had. */
export function deviceCookieWith(cookie: string | null | undefined, memberId: string): string {
  const ids = [memberId, ...deviceAccounts(cookie).filter((id) => id !== memberId)].slice(0, DEVICE_ACCOUNTS_MAX);
  return ids.map((id) => `${id}.${signValue(DEVICE_LABEL, id)}`).join('~');
}

/** Remembers on the response that this browser has now logged in to this account. */
export function rememberDevice(res: NextResponse, req: NextRequest, memberId: string): void {
  res.cookies.set(DEVICE_COOKIE, deviceCookieWith(req.cookies.get(DEVICE_COOKIE)?.value, memberId), DEVICE_COOKIE_OPTIONS);
}

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

/*
 * Admin server pages and their generateMetadata. The admin layout shows a
 * non-admin the "for FastMatch staff" card instead of the page, but Next
 * renders a layout and its page side by side: the page's own code still
 * runs, and whatever it fetches can reach the browser. So every admin server
 * page (or generateMetadata) that reads data checks for itself, with one of
 * these two:
 */

/** The signed-in admin, or null for anyone else (when the page has its own way of saying no). */
export async function getCurrentAdmin() {
  const member = await getCurrentMember();
  return member?.isAdmin ? member : null;
}

/** The signed-in admin; anyone else gets the "page not found" page, and nothing is read. */
export async function requireAdminPage() {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();
  return admin;
}
