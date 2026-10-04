import crypto from 'crypto';
import { safeNext } from './safeNext';

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
