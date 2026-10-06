// Pure (no provider code), so the blast screens can count exactly the
// characters members will receive.

/**
 * Australian spam law requires a working unsubscribe on commercial electronic
 * messages, so every marketing text (a blast) gets an opt-out line added to
 * the end of what the admin wrote. The admin's own wording is never changed
 * (the user, 6 Oct).
 *
 * The line is a short link to the opt-out page, "Opt out:
 * 5minutedating.com.au/optout", where they unsubscribe with a tap (signed in)
 * or by entering their mobile. It used to be "Reply STOP to opt out", but
 * texts come from the name "Fastmatch", which can't be replied to, and a STOP
 * reply was never recorded on the site anyway (Gil, Q16). It's one link for
 * everyone, so a blast is still one message to all its recipients.
 *
 * TRANSACTIONAL messages (verification codes, event-change alerts) must NOT
 * get this. They aren't marketing, and inviting someone to opt out of the
 * text telling them their event moved would be actively harmful.
 */

/** The site's address without "https://", as it reads in a text. */
function siteHost(): string {
  // The admin's browser is on the site itself; the server knows it from APP_URL.
  if (typeof window !== 'undefined') return window.location.host;
  try {
    return new URL(process.env.APP_URL ?? '').host;
  } catch {
    return '';
  }
}

/** "Opt out: 5minutedating.com.au/optout" */
export function smsOptOutLine(host: string = siteHost()): string {
  return `Opt out: ${host}/optout`;
}

export function withOptOut(body: string, host?: string): string {
  const text = body.trim();
  if (!text) return text;
  // Don't double up if the admin already wrote their own opt-out line.
  if (/\bSTOP\b/i.test(text) || /\/optout\b/i.test(text)) return text;
  return `${text}\n${smsOptOutLine(host)}`;
}
