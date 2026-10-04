import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { prisma } from './prisma';

// Simple fixed-window counters, kept in the database so they survive a
// restart (the site runs as one process, but an in-memory count would reset
// on every deploy). Used for failed logins, mobile code guesses, code
// resends, password resets, sign-ups, Contact Us and Tell A Friend.

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;

export interface Bucket { count: number; resetAt: Date }

/** Every limit in one place. */
export const LIMITS = {
  /** Failed logins for one account: then it waits out the window. */
  loginEmail: { limit: 10, windowMs: 15 * MINUTE },
  /** Failed logins from one address. Generous: a venue's wifi is shared on the night. */
  loginIp: { limit: 50, windowMs: 15 * MINUTE },
  /** Wrong guesses at one mobile code; then the code is cancelled and a new one needed. */
  mobileCodeGuesses: { limit: 5, windowMs: 15 * MINUTE },
  /** "Resend code" presses per member (each one is a paid text). */
  codeResends: { limit: 3, windowMs: HOUR },
  /** Reset emails per address asked for, and per visitor address. */
  resetEmail: { limit: 3, windowMs: HOUR },
  resetIp: { limit: 20, windowMs: HOUR },
  /** Contact Us messages per visitor address. */
  contactIp: { limit: 5, windowMs: HOUR },
  /** Sign-ups per visitor address (every valid sign-up counts, whatever the email). */
  registerIp: { limit: 3, windowMs: HOUR },
  /** Sign-up emails per address asked for, so the form can't flood an inbox. */
  signupEmail: { limit: 3, windowMs: HOUR },
  /** Email-change links per member (each one emails an address they typed). */
  emailChange: { limit: 3, windowMs: HOUR },
  /** Tell A Friend invitations per member (it needs sign-in, so per member rather than per address). */
  tellAFriend: { limit: 5, windowMs: HOUR },
} as const;

/**
 * The rule, on its own so it can be tested: a new window starts once the old
 * one has passed; within a window, the attempt that would go past `limit` is
 * refused and doesn't count.
 */
export function nextBucket(bucket: Bucket | null, now: Date, limit: number, windowMs: number): Bucket & { allowed: boolean } {
  if (!bucket || bucket.resetAt <= now) return { allowed: true, count: 1, resetAt: new Date(now.getTime() + windowMs) };
  if (bucket.count >= limit) return { allowed: false, count: bucket.count, resetAt: bucket.resetAt };
  return { allowed: true, count: bucket.count + 1, resetAt: bucket.resetAt };
}

/** A key for a person or address: hashed, so no IP or email sits in this table. */
export function rateKey(prefix: string, value: string): string {
  return `${prefix}:${crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 40)}`;
}

/**
 * The visitor's address. The site sits behind Nginx, which passes the real
 * one in X-Forwarded-For / X-Real-IP; anywhere else (local development)
 * every request shares one bucket.
 */
export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Counts one attempt. `allowed: false` once the limit for this window is reached. */
export async function hitRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; count: number; retryAfterSeconds: number }> {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const bucket = await tx.rateLimit.findUnique({ where: { key } });
    const next = nextBucket(bucket, now, limit, windowMs);
    if (next.allowed) {
      await tx.rateLimit.upsert({
        where: { key },
        create: { key, count: next.count, resetAt: next.resetAt },
        update: { count: next.count, resetAt: next.resetAt },
      });
    }
    return next;
  });
  // Now and then, clear out windows long gone so the table stays small.
  if (Math.random() < 0.02) {
    prisma.rateLimit.deleteMany({ where: { resetAt: { lt: now } } }).catch(() => {});
  }
  return {
    allowed: result.allowed,
    count: result.count,
    retryAfterSeconds: Math.max(1, Math.ceil((result.resetAt.getTime() - now.getTime()) / 1000)),
  };
}

/** Has this key already used up its window, without counting another attempt? */
export async function isRateLimited(key: string, limit: number): Promise<boolean> {
  const bucket = await prisma.rateLimit.findUnique({ where: { key } });
  return !!bucket && bucket.resetAt > new Date() && bucket.count >= limit;
}

/** Starts a key afresh (a successful login, a new mobile code). */
export async function clearRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } });
}
