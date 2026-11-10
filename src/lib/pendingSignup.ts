import crypto from 'crypto';
import { safeNext } from './safeNext';
import { signValue, signatureMatches } from './tokens';

/*
 * Signing up never says whether an address already belongs to a member
 * (anyone could otherwise check whether a given person is on a dating site).
 * The form always answers "check your email", and what arrives depends on the
 * address:
 *   - a new address gets a link that creates the account (it doesn't exist
 *     until then, so nothing — not even trying to log in with the password
 *     just typed — can tell the two cases apart);
 *   - a member's address gets "you already have an account";
 *   - someone added by a friend, who never chose a password, gets a fresh
 *     set-password link.
 * The details typed in wait in a PendingSignup row until the link is used.
 * The link carries a random token; only its hash is stored.
 */

/** How long a "finish signing up" link works. */
export const PENDING_SIGNUP_DAYS = 7;

/** What was typed into the sign-up form, kept until the link is clicked. */
export interface PendingSignupData {
  name: string;
  gender: 'MALE' | 'FEMALE';
  passwordHash: string;
  cityId: string;
  /** "YYYY-MM-DD" */
  dateOfBirth: string;
  mobile: string;
  marketingOptIn: boolean;
  /** Where they were going when they signed up (a page on this site), if anywhere. */
  next?: string;
}

/**
 * A `next` sent with a sign-up, kept only if it's a page on this site (the
 * same rule as the login page's — src/lib/safeNext.ts), else dropped.
 */
export function signupNext(next: unknown): string | undefined {
  if (typeof next !== 'string' || next.length > 500) return undefined;
  return safeNext(next, '', 'https://fastmatch.invalid') || undefined;
}

export function hashSignupToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** A new link token (URL-safe), and the hash to store for it. */
export function newSignupToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashSignupToken(token) };
}

/*
 * "This browser filled in the sign-up form" — the fm_signup cookie.
 *
 * Anyone can type someone else's address into the sign-up form, with a
 * password of their own. If the owner then clicked "Confirm my email" (it
 * does say "if you didn't sign up, ignore this"), the account used to be
 * made with the stranger's password, and the stranger could log in to it.
 * So the link only works straight away in the browser the form was filled
 * in, which carries this cookie; anywhere else (a phone's mail app, another
 * computer) it first asks for the password chosen at sign-up, which only the
 * person who filled in the form knows.
 *
 * The cookie holds a signature of each recent sign-up's token hash (made with
 * the site's secret, so it can't be made up), newest first, joined by "~": a
 * second go at the form (fixing a typo) doesn't spoil the first email's link.
 * The form ALWAYS sets it, with a meaningless signature when no account is
 * being made (the address is already a member's), so the reply can't tell
 * the two apart.
 */

export const SIGNUP_COOKIE = 'fm_signup';
const SIGNUP_LABEL = 'signup';
const SIGNUP_COOKIE_MAX = 5;
const MARK = /^[A-Za-z0-9_-]{43}$/;

export const SIGNUP_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: PENDING_SIGNUP_DAYS * 24 * 60 * 60,
};

/** The fm_signup value once this sign-up (its token hash) is added first. */
export function signupCookieWith(cookie: string | null | undefined, tokenHash: string): string {
  const mark = signValue(SIGNUP_LABEL, tokenHash);
  const others = (cookie ?? '').split('~').filter((m) => MARK.test(m) && m !== mark);
  return [mark, ...others].slice(0, SIGNUP_COOKIE_MAX).join('~');
}

/** Was this sign-up (its token hash) made in the browser that sent this cookie? */
export function signupCookieHas(cookie: string | null | undefined, tokenHash: string): boolean {
  if (!cookie || cookie.length > 500) return false;
  return cookie.split('~').slice(0, SIGNUP_COOKIE_MAX).some((m) => signatureMatches(SIGNUP_LABEL, tokenHash, m));
}

/** A token hash belonging to no sign-up, for the cookie when no account is being made. */
export function throwawaySignupHash(): string {
  return newSignupToken().tokenHash;
}
