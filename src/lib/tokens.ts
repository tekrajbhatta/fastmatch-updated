import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// Every token the site signs shares JWT_SECRET, so a valid signature alone
// proves nothing about what a token is FOR. Each check insists on its own
// kind: a session check must never accept an unsubscribe link, a password
// reset or an email confirmation (all of which carry a memberId and arrive by
// email, so anyone who saw the email could otherwise log in as that member).
//
// The secret is read on each call, never at module scope: Next imports every
// route module during `next build`, where a module-scope env check that
// throws would break the build.

function secret(): string {
  return process.env.JWT_SECRET as string;
}

/**
 * A short fingerprint of a member's password hash. Tokens carry it so they
 * stop working once the password changes: a used reset link can't be used
 * again, and a password change logs out every other device. Never the hash
 * itself — a token's payload is readable by whoever holds it.
 */
export function passwordFingerprint(passwordHash: string): string {
  return crypto.createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
}

// ---- sessions (the fm_session cookie) --------------------------------------

export const SESSION_DAYS = 30;

export function signSessionToken(member: { id: string; passwordHash: string }): string {
  return jwt.sign(
    { memberId: member.id, typ: 'session', pwd: passwordFingerprint(member.passwordHash) },
    secret(),
    { expiresIn: `${SESSION_DAYS}d` },
  );
}

export interface SessionClaims {
  memberId: string;
  /** Absent on sessions issued before fingerprints existed (they lapse within 30 days). */
  pwd?: string;
}

/**
 * The member a session token belongs to, or null for anything that isn't a
 * live session token. Sessions issued before this check existed carry only
 * { memberId }, so a token is accepted when it is marked as a session OR has
 * no `purpose` at all; every purpose-bound token (unsubscribe, verify_email,
 * set_password, password_reset) is refused.
 */
export function readSessionToken(token: string): SessionClaims | null {
  let payload: unknown;
  try {
    payload = jwt.verify(token, secret());
  } catch {
    return null; // expired, tampered with, or not ours
  }
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if ('purpose' in p) return null;
  if (p.typ !== undefined && p.typ !== 'session') return null;
  if (typeof p.memberId !== 'string' || !p.memberId) return null;
  return { memberId: p.memberId, pwd: typeof p.pwd === 'string' ? p.pwd : undefined };
}

/** False once the member's password has changed since the session was issued. */
export function sessionStillValid(claims: SessionClaims, member: { passwordHash: string }): boolean {
  return !claims.pwd || claims.pwd === passwordFingerprint(member.passwordHash);
}

// ---- emailed links ---------------------------------------------------------

export const RESET_LINK_MINUTES = 30;

/** "Choose a new password" link: dies after 30 minutes, or as soon as the password changes. */
export function signPasswordResetToken(member: { id: string; passwordHash: string }): string {
  return jwt.sign(
    { memberId: member.id, purpose: 'password_reset', pwd: passwordFingerprint(member.passwordHash) },
    secret(),
    { expiresIn: `${RESET_LINK_MINUTES}m` },
  );
}

/** "Confirm my email" link, tied to the address it was sent to. */
export function signEmailVerificationToken(member: { id: string; email: string }): string {
  return jwt.sign(
    { memberId: member.id, purpose: 'verify_email', email: member.email.toLowerCase() },
    secret(),
    { expiresIn: '7d' },
  );
}

/**
 * Reads a purpose-bound token (anything but a session). `reason` separates an
 * expired or forged link from one meant for something else.
 */
export function readPurposeToken(
  token: string,
  purpose: 'password_reset' | 'verify_email' | 'set_password' | 'unsubscribe',
): { ok: true; memberId: string; pwd?: string; email?: string } | { ok: false; reason: 'invalid' | 'wrong_purpose' } {
  let payload: unknown;
  try {
    payload = jwt.verify(token, secret());
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'invalid' };
  const p = payload as Record<string, unknown>;
  if (p.purpose !== purpose || typeof p.memberId !== 'string') return { ok: false, reason: 'wrong_purpose' };
  return {
    ok: true,
    memberId: p.memberId,
    pwd: typeof p.pwd === 'string' ? p.pwd : undefined,
    email: typeof p.email === 'string' ? p.email : undefined,
  };
}
