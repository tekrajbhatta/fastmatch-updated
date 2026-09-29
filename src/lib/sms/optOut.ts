// Pure (no provider code), so the blast screens can count exactly the
// characters members will receive.

/**
 * Australian spam law requires a working unsubscribe on commercial electronic
 * messages. Marketing texts previously went out exactly as typed, with no
 * opt-out at all — the only thing covering FastMatch was that Cellcast honours
 * a STOP reply to the shared number.
 *
 * "Reply STOP to opt out" is the cheapest legal option: it costs 22 characters
 * and no extra infrastructure, because Cellcast already processes STOP and
 * suppresses that number from future sends.
 *
 * CAUTION: this only works while messages are sent from a NUMBER. Switching
 * the sender to an alphanumeric ID like "FastMatch" makes replies impossible,
 * and this line becomes a promise the system can't keep — an opt-out link
 * would be needed instead.
 *
 * TRANSACTIONAL messages (verification codes, event-change alerts) must NOT
 * get this. They aren't marketing, and inviting someone to opt out of the
 * text telling them their event moved would be actively harmful.
 */
export const SMS_OPT_OUT = 'Reply STOP to opt out';

export function withOptOut(body: string): string {
  const text = body.trim();
  if (!text) return text;
  // Don't double up if the admin already wrote their own opt-out line.
  if (/\bSTOP\b/i.test(text)) return text;
  return `${text}\n${SMS_OPT_OUT}`;
}
