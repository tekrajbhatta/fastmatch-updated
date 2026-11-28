import crypto from 'crypto';

// Mailgun's webhook reports (Sending > Webhooks in the Mailgun dashboard).
// Each POST is JSON: { signature: { timestamp, token, signature },
// "event-data": { event, severity, recipient, "delivery-status": {...} } }.
// See https://documentation.mailgun.com/docs/mailgun/user-manual/tracking-messages/

/** Older than this, a report is refused even if correctly signed (stops replays). */
export const MAX_AGE_SECONDS = 15 * 60;

/**
 * The signature's token, once it has been checked: each report Mailgun
 * signs carries a fresh random one, so seeing it a second time within the
 * 15 minutes above means the same report sent again (a replay). The route
 * remembers tokens for a little longer than that (src/app/api/webhooks/email-bounce).
 */
export function signatureToken(sig: unknown): string | null {
  if (!sig || typeof sig !== 'object') return null;
  const { token } = sig as Record<string, unknown>;
  return typeof token === 'string' && token ? token : null;
}

/**
 * Is this report really from Mailgun? Mailgun signs `timestamp + token` with
 * the account's webhook signing key (HMAC-SHA256, hex).
 */
export function verifyMailgunSignature(
  sig: unknown,
  signingKey: string,
  nowSeconds: number = Date.now() / 1000,
): boolean {
  if (!signingKey || !sig || typeof sig !== 'object') return false;
  const { timestamp, token, signature } = sig as Record<string, unknown>;
  if (typeof timestamp !== 'string' || typeof token !== 'string' || typeof signature !== 'string') return false;
  if (!/^\d+$/.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > MAX_AGE_SECONDS) return false;

  const expected = crypto.createHmac('sha256', signingKey).update(timestamp + token).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * The address to mark as bounced, if this report is a PERMANENT failure (the
 * mailbox doesn't exist, the domain is gone...). Temporary failures (a full
 * mailbox, a server briefly down) are retried by Mailgun and mean nothing is
 * wrong with the address, so they're ignored, as is every other event.
 */
export function permanentFailure(payload: unknown): { email: string; reason: string; detail: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const ev = (payload as Record<string, unknown>)['event-data'];
  if (!ev || typeof ev !== 'object') return null;
  const e = ev as Record<string, unknown>;
  if (e.event !== 'failed' || e.severity !== 'permanent' || typeof e.recipient !== 'string' || !e.recipient) return null;

  const status = (e['delivery-status'] && typeof e['delivery-status'] === 'object' ? e['delivery-status'] : {}) as Record<string, unknown>;
  const texts = [status.description, status.message, e.reason].filter((r): r is string => typeof r === 'string' && !!r.trim());
  const reason = texts[0];
  return {
    email: e.recipient.trim().toLowerCase(),
    reason: (reason ?? 'Permanent delivery failure').trim().slice(0, 190),
    // Everything the provider said, for blamesOurSending (the reason above is only the first part).
    detail: texts.join(' ').slice(0, 2000),
  };
}

/**
 * Does this failure blame how WE send, rather than the address? Then the
 * member mustn't be marked bounced: the address is fine, and fixing our side
 * fixes it for everyone.
 *
 * On 27-28 Nov 2026 every BigPond and o2.pl member emailed was marked bounced
 * ("5.7.1 Sender rejected", "refused mailfrom because return MX does not
 * exist"): mg.fastmatch.com.au had no MX record, and those providers check
 * the sender's domain. The same goes for authentication (SPF, DKIM, DMARC),
 * block lists, spam filters, and a provider's policy or reputation rules: one
 * problem on our side would otherwise mark thousands of good addresses.
 * Mailgun's own "Not delivering to previously bounced address" is a repeat
 * of an earlier bounce, and stays a bounce.
 */
export function blamesOurSending(reason: string): boolean {
  return /sender (address )?rejected|refused mail ?from|return mx|\b(spf|dkim|dmarc)\b|authenticat|spamhaus|block ?list|black ?list|blocked|reputation|\bspam\b|unsolicited|policy/i.test(reason);
}
