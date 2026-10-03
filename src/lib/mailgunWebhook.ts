import crypto from 'crypto';

// Mailgun's webhook reports (Sending > Webhooks in the Mailgun dashboard).
// Each POST is JSON: { signature: { timestamp, token, signature },
// "event-data": { event, severity, recipient, "delivery-status": {...} } }.
// See https://documentation.mailgun.com/docs/mailgun/user-manual/tracking-messages/

/** Older than this, a report is refused even if correctly signed (stops replays). */
const MAX_AGE_SECONDS = 15 * 60;

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
export function permanentFailure(payload: unknown): { email: string; reason: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const ev = (payload as Record<string, unknown>)['event-data'];
  if (!ev || typeof ev !== 'object') return null;
  const e = ev as Record<string, unknown>;
  if (e.event !== 'failed' || e.severity !== 'permanent' || typeof e.recipient !== 'string' || !e.recipient) return null;

  const status = (e['delivery-status'] && typeof e['delivery-status'] === 'object' ? e['delivery-status'] : {}) as Record<string, unknown>;
  const reason = [status.description, status.message, e.reason].find((r) => typeof r === 'string' && r.trim()) as string | undefined;
  return { email: e.recipient.trim().toLowerCase(), reason: (reason ?? 'Permanent delivery failure').trim().slice(0, 190) };
}
