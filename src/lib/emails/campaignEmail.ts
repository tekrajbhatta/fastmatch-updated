import { emailLayout } from './layout';

// Matches the structure of the real old promotional emails: free-text body
// (the campaign author writes this, e.g. venue/date/discount code details),
// wrapped in the standard layout with a per-member unsubscribe link.
export function campaignEmail(opts: { subject: string; bodyHtml: string; unsubscribeUrl: string }) {
  const html = emailLayout(opts.bodyHtml, { unsubscribeUrl: opts.unsubscribeUrl });
  return { subject: opts.subject, html };
}
