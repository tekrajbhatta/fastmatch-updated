/**
 * Did the mail server say this ADDRESS is no good (so the member should be
 * marked bounced), rather than that something went wrong this time?
 *
 * Blasts used to mark a member bounced on any send error, so one mail-server
 * outage could quietly drop up to 100 people from every future blast. Only a
 * permanent rejection of the recipient counts: a 5xx answer to RCPT TO, the
 * step that names the address. nodemailer uses the same error code
 * (EENVELOPE) when the server refuses OUR sender address (MAIL FROM) or the
 * message (DATA) — say the sending domain is suspended — and marking everyone
 * bounced for that would be the very outage problem this fixes, so the
 * command decides, not the code. Connection problems, timeouts and 4xx "try
 * again later" answers leave the member alone too. (Mailgun usually accepts
 * the message and reports a bounce later, through /api/webhooks/email-bounce.)
 */
export function isPermanentAddressRejection(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { responseCode?: unknown; command?: unknown };
  const code = typeof e.responseCode === 'number' ? e.responseCode : NaN;
  return code >= 500 && code < 600 && typeof e.command === 'string' && /^RCPT TO/i.test(e.command);
}
