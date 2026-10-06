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
 * Every blast text gets it, even one that already says "Reply STOP": nobody
 * can reply to a text from "Fastmatch", so that text would otherwise have no
 * opt-out that works (the user, 6 Oct). The blast forms point a STOP out to
 * the admin, to take it out themselves (mentionsReplyStop).
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
  // Don't add the link twice, when the admin already put it in.
  if (/\/optout\b/i.test(text)) return text;
  return `${text}\n${smsOptOutLine(host)}`;
}

/**
 * Does the admin's text ask members to reply STOP? That can't work, so the
 * blast forms ask for it to be taken out (the opt-out link is added anyway).
 * A capitalised STOP or "reply stop": not "don't stop now".
 */
export function mentionsReplyStop(body: string): boolean {
  return /\bSTOP\b/.test(body) || /\breply\s+stop\b/i.test(body);
}
