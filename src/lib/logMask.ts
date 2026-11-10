/**
 * Personal details as they may appear in a log line. Server and cron logs
 * (journalctl, /var/log/fastmatch) are kept for weeks and read when something
 * goes wrong; they need enough to tell entries apart, not whole addresses or
 * numbers. Prefer logging a member or booking id where there is one.
 */

/** "jane.smith@gmail.com" -> "j***@g***.com" */
export function maskEmail(email: string | null | undefined): string {
  const e = (email ?? '').trim();
  const at = e.lastIndexOf('@');
  if (at < 1) return e ? '***' : '';
  const domain = e.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${e[0]}***@${domain[0] ?? ''}***${tld}`;
}

/** "0412 345 678" -> "***678" */
export function maskMobile(mobile: string | null | undefined): string {
  const digits = (mobile ?? '').replace(/\D/g, '');
  return digits ? `***${digits.slice(-3)}` : '';
}
