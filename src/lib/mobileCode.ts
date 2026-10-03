import { randomInt } from 'crypto';

/**
 * A new 6-digit mobile verification code. From the operating system's secure
 * random source: Math.random's sequence can be worked out from a few of its
 * outputs, so its codes could in principle be predicted. Server-only.
 */
export function newMobileCode(): string {
  return String(randomInt(100000, 1000000));
}
