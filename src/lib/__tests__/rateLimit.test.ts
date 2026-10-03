import { describe, it, expect } from 'vitest';
import { nextBucket, rateKey, LIMITS } from '@/lib/rateLimit';

const now = new Date('2026-10-06T10:00:00Z');
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);

describe('nextBucket', () => {
  it('starts a window on the first attempt', () => {
    expect(nextBucket(null, now, 3, 15 * 60_000)).toEqual({ allowed: true, count: 1, resetAt: minutes(15) });
  });
  it('counts attempts up to the limit, then refuses without counting', () => {
    expect(nextBucket({ count: 2, resetAt: minutes(5) }, now, 3, 15 * 60_000)).toEqual({ allowed: true, count: 3, resetAt: minutes(5) });
    expect(nextBucket({ count: 3, resetAt: minutes(5) }, now, 3, 15 * 60_000)).toEqual({ allowed: false, count: 3, resetAt: minutes(5) });
  });
  it('starts again once the window has passed', () => {
    expect(nextBucket({ count: 99, resetAt: minutes(-1) }, now, 3, 15 * 60_000)).toEqual({ allowed: true, count: 1, resetAt: minutes(15) });
  });
});

describe('rateKey', () => {
  it('never stores the raw value, and ignores case and spaces', () => {
    const key = rateKey('login-email', ' Olivia@Example.com ');
    expect(key).toBe(rateKey('login-email', 'olivia@example.com'));
    expect(key).not.toContain('olivia');
    expect(key.startsWith('login-email:')).toBe(true);
    expect(key.length).toBeLessThanOrEqual(191); // fits the table's key column
  });
});

describe('LIMITS', () => {
  it('stay generous enough for a venue full of people on one wifi', () => {
    expect(LIMITS.loginIp.limit).toBeGreaterThanOrEqual(50);
    expect(LIMITS.resetIp.limit).toBeGreaterThanOrEqual(20);
  });
});
