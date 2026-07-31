import { emailLayout } from './layout';

export function matchResultsEmail(opts: {
  memberName: string;
  eventName: string;
  eventDate: Date;
  dateMatches: { name: string; email: string; mobile: string }[];
  friendMatches: { name: string; email: string; mobile: string }[];
}) {
  const dateStr = opts.eventDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  const listItem = (m: { name: string; email: string; mobile: string }) =>
    `<li>${m.name} — ${m.email} — ${m.mobile}</li>`;

  const html = emailLayout(`
    <h1 style="color:#3D1E6D;">Your matches from ${opts.eventName}</h1>
    <p>Hi ${opts.memberName},</p>
    <p>Here's how ${dateStr} turned out — contact details are only shared for people you both matched with.</p>

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
        ? `<p>No mutual matches this time — thanks for coming along, and we hope to see you at a future event.</p>`
        : ''
    }

    <p>The FastMatch Team</p>
  `);

  return { subject: `Your matches from ${opts.eventName}`, html };
}
