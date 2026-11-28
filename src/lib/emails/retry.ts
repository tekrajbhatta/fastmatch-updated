/**
 * Trying an email again when the mail server says "not now".
 *
 * Mailgun refuses more than 26 recipients in 30 seconds from our domain,
 * answering `421 Domain mg.fastmatch.com.au is not allowed to send: recipient
 * limit (26) exceeded, try again after Fri, 27 Nov 2026 22:51:41 UTC`. On 27
 * and 28 Nov 2026, 77 blast emails were refused that way and simply counted
 * as failed. A 4xx answer is the server saying the message was refused this
 * time and may be sent again, so it's safe to retry: nothing went out. Any
 * other failure (a 5xx answer, a dropped connection, which may have
 * delivered) is left to the caller, as before.
 */

/** A "try again later" answer (4xx) from the mail server. */
export function isTemporaryRefusal(err: unknown): boolean {
  const code = err && typeof err === 'object' ? (err as { responseCode?: unknown }).responseCode : undefined;
  return typeof code === 'number' && code >= 400 && code < 500;
}

/** Never wait longer than this before a retry: callers include requests a person (or Stripe) is waiting on. */
export const MAX_RETRY_WAIT_MS = 35_000;
/** When the answer doesn't say when: Mailgun's windows are 30 seconds. */
const DEFAULT_RETRY_WAIT_MS = 30_000;

/**
 * How long to wait before trying again: until the time Mailgun gave ("try
 * again after <date> UTC"), a second over, between 1 and 35 seconds.
 */
export function retryDelayMs(err: unknown, now: number = Date.now()): number {
  const text = [(err as { response?: unknown })?.response, (err as { message?: unknown })?.message]
    .filter((t): t is string => typeof t === 'string')
    .join(' ');
  const m = text.match(/try again after ([A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} (?:UTC|GMT))/);
  const at = m ? Date.parse(m[1].replace(/UTC$/, 'GMT')) : NaN;
  const wait = Number.isNaN(at) ? DEFAULT_RETRY_WAIT_MS : at - now + 1000;
  return Math.min(MAX_RETRY_WAIT_MS, Math.max(1000, wait));
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `send`, and again after a temporary refusal, up to `attempts` times
 * in all. The last error is thrown as it came.
 */
export async function withTemporaryRetry<T>(
  send: () => Promise<T>,
  opts: { attempts: number; sleep?: (ms: number) => Promise<void>; onRetry?: (err: unknown, waitMs: number, attempt: number) => void },
): Promise<T> {
  const sleep = opts.sleep ?? realSleep;
  for (let attempt = 1; ; attempt++) {
    try {
      return await send();
    } catch (err) {
      if (attempt >= opts.attempts || !isTemporaryRefusal(err)) throw err;
      const wait = retryDelayMs(err);
      opts.onRetry?.(err, wait, attempt);
      await sleep(wait);
    }
  }
}
