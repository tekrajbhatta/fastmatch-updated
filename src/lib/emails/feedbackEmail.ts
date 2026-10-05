import { emailLayout, EMAIL_HEADING } from './layout';
import { escapeHtml, oneLine } from '../escapeHtml';

/** Where member feedback goes — the same inbox as the Contact Us form. */
export const FEEDBACK_TO = 'gil@fastmatch.com.au';

const P = 'margin:0 0 12px;';

/** Member feedback, from the Feedback page, to Gil. */
export function memberFeedbackEmail(opts: {
  member: { name: string; email: string; mobile: string };
  event: { name: string; venue: string; when: string } | null;
  message: string;
}) {
  const m = opts.member;
  const about = opts.event ? `${opts.event.when}: ${opts.event.name} at ${opts.event.venue}` : 'General comment (no particular event)';
  const html = emailLayout(`
    <h1 style="${EMAIL_HEADING}">Member feedback</h1>
    <p style="${P}"><strong>From:</strong> ${escapeHtml(m.name)} ·
      <a href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a> · ${escapeHtml(m.mobile)}</p>
    <p style="${P}"><strong>About:</strong> ${escapeHtml(about)}</p>
    <div style="white-space:pre-wrap;border-left:4px solid #A4CE39;background:#F1E9F8;padding:12px 16px;border-radius:8px;">${escapeHtml(opts.message)}</div>
    <p style="margin:16px 0 0;font-size:13px;color:#666;">Reply to the member at the address above. Replying to this email won't reach them.</p>
  `);
  const subject = oneLine(opts.event ? `Feedback from ${m.name}: ${opts.event.name} (${opts.event.when})` : `Feedback from ${m.name}`);
  return { subject, html };
}
