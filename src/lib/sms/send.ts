/**
 * Central SMS send function, mirroring src/lib/emails/send.ts. Every SMS in
 * the app goes through here — verification codes, event-change alerts, and
 * campaign blasts alike.
 *
 * Provider: Cellcast (https://api.cellcast.com/api/v1/gateway).
 *
 * Two entry points:
 *   sendSms      — one recipient. Throws on failure.
 *   sendSmsBulk  — many recipients in ONE request, returning per-recipient
 *                  failures instead of throwing, so a single bad number can't
 *                  abort a whole campaign batch.
 *
 * Falls back to a console.log stub when CELLCAST_API_KEY is unset, so local
 * development, CI and the production build never accidentally text anyone.
 */

interface SendSmsArgs {
  to: string;
  body: string;
}

export interface SmsFailure {
  to: string;
  reason: string;
}

export interface SmsBulkResult {
  sent: number;
  failed: SmsFailure[];
}

import { australianMobile } from '../mobile';
import { maskMobile } from '../logMask';

const DEFAULT_API_URL = 'https://api.cellcast.com/api/v1/gateway';

/** Why a number was never sent to (see sendSmsBulk). */
export const NOT_AU_MOBILE = 'Not an Australian mobile number';

/**
 * On the live site a missing Cellcast key is a mistake, not a choice: every
 * text would silently go nowhere, and verification codes would be printed to
 * the log. Locally and in tests (NODE_ENV isn't "production") the stub stays.
 */
function assertConfiguredInProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SMS not sent: CELLCAST_API_KEY is not set.');
  }
}

/** Single recipient. Throws on failure. */
export async function sendSms({ to, body }: SendSmsArgs): Promise<void> {
  if (!australianMobile(to)) throw new Error(`SMS not sent: ${NOT_AU_MOBILE.toLowerCase()}`);
  if (!process.env.CELLCAST_API_KEY) {
    assertConfiguredInProduction();
    console.log(`[stub] Would SMS ${to}: "${body}"`);
    return;
  }

  const result = await sendSmsBulk({ to: [to], body });
  if (result.failed.length > 0) {
    throw new Error(`SMS send failed: ${result.failed[0].reason}`);
  }
}

/**
 * Many recipients in a single Cellcast request. Returns failures rather than
 * throwing — an invalid or unsubscribed number must not abort an entire
 * campaign batch and strand the recipients after it.
 */
export async function sendSmsBulk({ to, body }: { to: string[]; body: string }): Promise<SmsBulkResult> {
  // Only Australian mobiles are ever texted (Gil, Q21). Anything else (an old
  // landline, an overseas number, a typing slip) could be anyone's, or a
  // premium number that costs far more per text: it's reported as failed,
  // against the number as given, and never sent.
  const notMobile: SmsFailure[] = [];
  const recipients: string[] = [];
  for (const r of to.filter(Boolean)) {
    if (australianMobile(r)) recipients.push(r);
    else notMobile.push({ to: r, reason: NOT_AU_MOBILE });
  }
  if (recipients.length === 0) return { sent: 0, failed: notMobile };
  const result = await sendToCellcast(recipients, body);
  return notMobile.length ? { sent: result.sent, failed: [...notMobile, ...result.failed] } : result;
}

/** The send itself, to numbers already checked to be Australian mobiles. */
async function sendToCellcast(recipients: string[], body: string): Promise<SmsBulkResult> {
  if (!process.env.CELLCAST_API_KEY) {
    assertConfiguredInProduction();
    for (const r of recipients) console.log(`[stub] Would SMS ${r}: "${body}"`);
    return { sent: recipients.length, failed: [] };
  }

  const url = process.env.CELLCAST_API_URL || DEFAULT_API_URL;

  // No default sender ID. Cellcast rejects the WHOLE request with HTTP 400
  // ("Your sender id is not registered.") if it doesn't recognise the value,
  // so defaulting to a plausible-looking brand name fails every single send.
  // Blank/unset means omit the field entirely, and Cellcast sends from its
  // shared number pool — which always works. Set CELLCAST_SENDER_ID only to
  // an ID actually registered in the Cellcast dashboard.
  const sender = process.env.CELLCAST_SENDER_ID?.trim() || '';

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CELLCAST_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      // Numbers are normalised to 61XXXXXXXXX before sending — see
      // toCellcastNumber() for why. Failures are still reported against the
      // ORIGINAL strings the caller passed, so logs match the member records.
      body: JSON.stringify({
        message: body,
        contacts: recipients.map((r) => australianMobile(r) ?? toCellcastNumber(r)),
        ...(sender ? { sender } : {}),
      }),
    });
  } catch (err) {
    // Network-level failure — nothing was delivered, so every recipient failed.
    console.error(`Failed to SMS ${recipients.length} recipient(s) via Cellcast:`, err);
    return {
      sent: 0,
      failed: recipients.map((to) => ({ to, reason: err instanceof Error ? err.message : String(err) })),
    };
  }

  const raw = await res.text();

  if (!res.ok) {
    // Cellcast's documented error shapes both carry a usable message:
    //   400 / 401 -> { code, message, stack }
    //   422       -> { status: false, message, error: { errorMessage } }  (credit too low)
    let reason = `HTTP ${res.status}`;
    try {
      const body = JSON.parse(raw) as Record<string, any>;
      reason = String(body.error?.errorMessage ?? body.message ?? reason);
    } catch {
      /* non-JSON error body — keep the status code */
    }
    // Cellcast's answer can quote the numbers sent: kept out of the log.
    console.error(`Cellcast rejected the request (HTTP ${res.status}):`, redactNumbers(reason), redactNumbers(raw.slice(0, 300)));
    return { sent: 0, failed: recipients.map((to) => ({ to, reason })) };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    // 2xx but unparseable — treat as sent rather than risk re-sending later,
    // but make it loud so the response shape can be corrected.
    console.error('Cellcast returned non-JSON on a 2xx response:', redactNumbers(raw.slice(0, 500)));
    return { sent: recipients.length, failed: [] };
  }

  return parseCellcastResult(payload, recipients);
}

/**
 * Maps a Cellcast response onto per-recipient outcomes.
 *
 * Written against Cellcast's documented Bulk Send SMS response
 * (https://developer.cellcast.com/api-docs/bulk-sms.html):
 *
 *   {
 *     "status": true,                      // BOOLEAN, not a string
 *     "message": "Request is being processed",
 *     "data": {
 *       "queueResponse": [ { "Contact": "400000000", "MessageId": "...", "Result": "Message added to queue." } ],
 *       "invalidContacts": [ { "Contact": "+6140000", "Error": "Number is less than 9 digit", "ErrorType": "less_nine_digit" } ],
 *       "unsubscribeContacts": [ "400000003" ],
 *       "totalValidContact": 3, "totalInvalidContact": 4, "totalUnsubscribeContact": 1
 *     },
 *     "error": {}
 *   }
 *
 * Note the capitalised `Contact` / `Error` keys and the camelCase bucket
 * names — both are easy to get wrong, and getting them wrong means every
 * rejection is silently counted as delivered.
 */
export function parseCellcastResult(payload: unknown, recipients: string[]): SmsBulkResult {
  const root = (payload ?? {}) as Record<string, any>;
  const data = (root.data ?? {}) as Record<string, any>;

  // Whole-request failure. Cellcast uses a boolean `status`, and returns
  // status:false with a reason for e.g. "Your balance is too low for this
  // request, please recharge." (documented on the 422, but handled here too
  // in case it ever arrives on a 2xx).
  if (root.status === false) {
    const reason = String(root.error?.errorMessage ?? root.message ?? 'Cellcast reported failure');
    console.error('Cellcast reported a failed request:', redactNumbers(reason));
    return { sent: 0, failed: recipients.map((to) => ({ to, reason })) };
  }

  // The {code, message, stack} envelope Cellcast uses for 400/401. Should
  // arrive with a non-2xx status (handled by the caller), but if it ever
  // comes back on a 200 it must not be mistaken for success.
  if (typeof root.code === 'number' && root.code >= 400) {
    const reason = String(root.message ?? `Cellcast error ${root.code}`);
    console.error('Cellcast returned an error envelope:', root.code, redactNumbers(reason));
    return { sent: 0, failed: recipients.map((to) => ({ to, reason })) };
  }

  const failed: SmsFailure[] = [];
  const seen = new Set<string>();

  const reject = (rawNumber: unknown, reason: string) => {
    const match = matchRecipient(String(rawNumber ?? ''), recipients);
    if (match && !seen.has(match)) {
      seen.add(match);
      failed.push({ to: match, reason });
    }
  };

  // invalidContacts: [{ Contact, Error, ErrorType }] — carry Cellcast's own
  // wording through, since "Number is less than 9 digit" is more useful than
  // a generic label when someone has to fix the member record.
  if (Array.isArray(data.invalidContacts)) {
    for (const entry of data.invalidContacts) {
      const number = typeof entry === 'string' ? entry : entry?.Contact ?? entry?.contact;
      const reason = typeof entry === 'object' ? String(entry?.Error ?? 'Number is not valid') : 'Number is not valid';
      reject(number, reason);
    }
  }

  // unsubscribeContacts: plain strings, e.g. ["400000003"]
  if (Array.isArray(data.unsubscribeContacts)) {
    for (const entry of data.unsubscribeContacts) {
      reject(typeof entry === 'string' ? entry : entry?.Contact ?? entry?.contact, 'unsubscribed');
    }
  }

  if (failed.length > 0) {
    // Numbers masked: enough to tell the entries apart, not to text anyone.
    console.error(`Cellcast rejected ${failed.length} of ${recipients.length} recipient(s):`, maskFailures(failed));
  }

  // Prefer Cellcast's own count of what it actually queued. It is the
  // authoritative number — if it ever drops a recipient without listing it in
  // either rejection bucket, this reports the truth rather than assuming
  // everything not explicitly rejected was sent.
  const queued = Array.isArray(data.queueResponse) ? data.queueResponse.length : null;
  const sent = queued ?? recipients.length - failed.length;

  if (queued !== null && queued !== recipients.length - failed.length) {
    console.warn(
      `Cellcast queued ${queued} message(s) but ${recipients.length - failed.length} recipient(s) were neither queued nor rejected.`
    );
  }

  return { sent, failed };
}

/**
 * Normalises an Australian mobile to `61XXXXXXXXX` before sending.
 *
 * Cellcast's docs are self-contradictory on accepted formats. The parameters
 * table lists "+61400000000", "61400000000", "0400000000" and "400000000" as
 * supported, but its own 400 error says contacts "must either start with 61 or
 * +61 and be exactly 11 digits long … or be 9 digits without the area code" —
 * which excludes the 10-digit 0-prefixed form.
 *
 * Members' mobiles are stored exactly as typed, which is usually the
 * 0-prefixed form. Rather than bet every message on which statement is right,
 * normalise to a form both agree on.
 *
 * Anything that doesn't look like an AU mobile is passed through untouched so
 * Cellcast can reject it and report why, rather than us mangling it silently.
 */
export function toCellcastNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('61') && digits.length === 11) return digits;        // 61412345678
  if (digits.startsWith('0') && digits.length === 10) return `61${digits.slice(1)}`; // 0412345678
  if (digits.length === 9 && digits.startsWith('4')) return `61${digits}`;   // 412345678
  return raw;
}

/**
 * Cellcast echoes numbers back in its own format — typically without the
 * leading 0 or country code ("400000000" for a number sent as "0400000000").
 * Match on the trailing digits rather than requiring an exact string match,
 * so failures can be reported against the original stored value.
 */
function matchRecipient(candidate: string, recipients: string[]): string | null {
  const digits = candidate.replace(/\D/g, '');
  if (!digits) return null;
  const tail = digits.slice(-8); // last 8 digits identify an AU subscriber number
  return recipients.find((r) => r.replace(/\D/g, '').endsWith(tail)) ?? null;
}

/** Failures as they may appear in a log: numbers masked ("***678"), reasons kept. */
export function maskFailures(failed: SmsFailure[]): { to: string; reason: string }[] {
  return failed.map((f) => ({ to: maskMobile(f.to), reason: redactNumbers(f.reason) }));
}

/** Any phone-number-like run of digits in a provider's message, masked. */
export function redactNumbers(text: string): string {
  return text.replace(/\+?\d[\d\s-]{6,}\d/g, (n) => maskMobile(n));
}

// Moved to ./optOut so the admin screens can count the same characters in
// the browser; re-exported here so existing imports keep working.
export { smsOptOutLine, withOptOut } from './optOut';
