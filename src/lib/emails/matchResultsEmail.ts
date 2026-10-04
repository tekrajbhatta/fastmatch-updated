import { emailLayout } from './layout';
import { escapeHtml, oneLine } from '../escapeHtml';

export function matchResultsEmail(opts: {
  memberName: string;
  eventName: string;
  eventDate: Date;
  timeZone: string;
  dateMatches: { name: string; email: string; mobile: string }[];
  friendMatches: { name: string; email: string; mobile: string }[];
}) {
  const dateStr = opts.eventDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: opts.timeZone });

  // Each match's details are exactly as THEY typed them into their profile,
  // and this email goes to someone else — escaped, so nobody can plant a
  // link or an image in another member's results.
  const listItem = (m: { name: string; email: string; mobile: string }) =>
    `<li>${escapeHtml(m.name)}, ${escapeHtml(m.email)}, ${escapeHtml(m.mobile)}</li>`;

  const html = emailLayout(`
    <h1 style="color:#3D1E6D;">Your matches from ${escapeHtml(opts.eventName)}</h1>
    <p>Hi ${escapeHtml(opts.memberName)},</p>
    <p>Here's how ${dateStr} turned out. Contact details are only shared for people you both matched with.</p>

    ${
      opts.dateMatches.length
        ? `<h2 style="color:#7A9A2E;">Date matches</h2><ul>${opts.dateMatches.map(listItem).join('')}</ul>`
        : ''
    }
    ${
      opts.friendMatches.length
        ? `<h2 style="color:#D98A1E;">Friend matches</h2><ul>${opts.friendMatches.map(listItem).join('')}</ul>`
        : ''
    }
    ${
      !opts.dateMatches.length && !opts.friendMatches.length
        ? `<p>No mutual matches this time. Thanks for coming along, and we hope to see you at a future event.</p>`
        : ''
    }

    <p>The FastMatch Team</p>
  `);

  return { subject: `Your matches from ${oneLine(opts.eventName)}`, html };
}
