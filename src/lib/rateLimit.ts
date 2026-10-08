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
  /**
   * Failed logins for one account from one address: then that address waits
   * out the window. Per address, so someone elsewhere who knows a member's
   * email can't lock them out by typing wrong passwords.
   */
  loginEmailIp: { limit: 10, windowMs: 15 * MINUTE },
  /** Failed logins for one account from anywhere: a cap on guessing from many addresses at once. */
  loginEmail: { limit: 50, windowMs: 15 * MINUTE },
  /** Failed logins from one address. Generous: a venue's wifi is shared on the night. */
  loginIp: { limit: 50, windowMs: 15 * MINUTE },
  /** Wrong guesses at one mobile code; then the code is cancelled and a new one needed. */
  mobileCodeGuesses: { limit: 5, windowMs: 15 * MINUTE },
  /** "Resend code" presses per member (each one is a paid text). */
  codeResends: { limit: 3, windowMs: HOUR },
  /** Reset emails per address asked for, and per visitor address. */
  resetEmail: { limit: 3, windowMs: HOUR },
  /** Set-password links emailed when a friend-made account tries to log in (it has no password yet). */
  welcomeLinkOnLogin: { limit: 3, windowMs: HOUR },
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
  /** Opt-outs by mobile number (the link in blast texts) per visitor address. */
  optOutIp: { limit: 10, windowMs: HOUR },
  /**
   * Booking attempts per member per event (each one holds places): plenty
   * for changing friends or a failed card, not enough to keep an event
   * looking full by booking over and over.
   */
  bookingAttempts: { limit: 10, windowMs: HOUR },
  /**
   * Discount codes checked per member (the event page checks as they type):
   * plenty for typing a code or two, not enough to try codes until one
   * works, which would turn up codes that were never advertised.
   */
  discountChecks: { limit: 30, windowMs: 15 * MINUTE },
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
 * The visitor's address. The site sits behind Nginx, which ADDS the address
 * it was connected from to the end of X-Forwarded-For
 * ($proxy_add_x_forwarded_for, as the server checks showed on 8 Oct), so the
 * last entry is the real one. Anything before it came from the visitor, who
 * can claim any address there: reading the first entry let anyone dodge the
 * per-address limits by claiming a new one each time (review item 54). Behind
 * Cloudflare, Nginx's real-IP settings (cloudflare-realip.conf) make that last
 * entry the visitor's own address too. X-Real-IP (also set by Nginx) is the
 * fallback; anywhere else (local development) every request shares one bucket.
 */
export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',').map((a) => a.trim()).filter(Boolean).pop();
  return forwarded || req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Counts one attempt. `allowed: false` once the limit for this window is
 * reached — the rule in nextBucket, applied by the database itself.
 *
 * Each step is one statement on the key's row, so attempts at the same
 * moment take turns: none can read a count another is about to change. It
 * used to read the count and then write it, so a burst of requests sent at
 * once all read the same count and could go past the limit together. (One
 * statement at a time also means they can't deadlock, as a locked
 * read-then-write transaction did under a burst.)
 */
export async function hitRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; count: number; retryAfterSeconds: number }> {
  const now = new Date();
  const freshReset = new Date(now.getTime() + windowMs);
  // The key's row, if it hasn't one yet.
  await prisma.$executeRaw`INSERT IGNORE INTO \`RateLimit\` (\`key\`, \`count\`, \`resetAt\`) VALUES (${key}, 0, ${freshReset})`;
  // The window has passed: a new one starts.
  await prisma.$executeRaw`UPDATE \`RateLimit\` SET \`count\` = 0, \`resetAt\` = ${freshReset} WHERE \`key\` = ${key} AND \`resetAt\` <= ${now}`;
  // Counted only while under the limit: the attempt that would go past it is refused and doesn't count.
  const counted = await prisma.$executeRaw`UPDATE \`RateLimit\` SET \`count\` = \`count\` + 1 WHERE \`key\` = ${key} AND \`count\` < ${limit}`;
  const bucket = await prisma.rateLimit.findUnique({ where: { key } });
  // Now and then, clear out windows long gone so the table stays small.
  if (Math.random() < 0.02) {
    prisma.rateLimit.deleteMany({ where: { resetAt: { lt: now } } }).catch(() => {});
  }
  const resetAt = bucket?.resetAt ?? freshReset;
  return {
    allowed: counted === 1,
    count: bucket?.count ?? (counted === 1 ? 1 : limit),
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000)),
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

/** The failed-login counters for an account, from this address and from anywhere. */
export function loginKeys(email: string, ip: string): { emailKey: string; emailIpKey: string } {
  return { emailKey: rateKey('login-email', email), emailIpKey: rateKey('login-email-ip', `${email.trim().toLowerCase()}|${ip}`) };
}

/**
 * The account can log in again: after a successful login, or once its
 * password has been reset (the locked-out message sends people to "Forgot
 * password?", which used to leave the lock in place).
 */
export async function clearLoginLock(email: string, ip: string): Promise<void> {
  const { emailKey, emailIpKey } = loginKeys(email, ip);
  await prisma.rateLimit.deleteMany({ where: { key: { in: [emailKey, emailIpKey] } } });
}
