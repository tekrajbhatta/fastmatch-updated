import { emailLayout, EMAIL_HEADING, EMAIL_SUBHEADING } from './layout';
import { escapeHtml, oneLine } from '../escapeHtml';
import { BRAND_COLORS } from '../brand';

const BUTTON = `background:${BRAND_COLORS.redCta};color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;`;

/**
 * The results email: every attendee gets one after the night. With matches,
 * their names and contact details; with none, Gil's encouragement to keep
 * going (it used to go to nobody, although the screen after choosing says
 * "You'll get an email").
 */
export function matchResultsEmail(opts: {
  memberName: string;
  eventName: string;
  eventDate: Date;
  timeZone: string;
  dateMatches: { name: string; email: string; mobile: string }[];
  friendMatches: { name: string; email: string; mobile: string }[];
  /** The Upcoming Events page, for the "no mutual matches" email. */
  eventsUrl: string;
}) {
  if (!opts.dateMatches.length && !opts.friendMatches.length) return noMatchesEmail(opts);

  const dateStr = opts.eventDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: opts.timeZone });

  // Each match's details are exactly as THEY typed them into their profile,
  // and this email goes to someone else — escaped, so nobody can plant a
  // link or an image in another member's results.
  const listItem = (m: { name: string; email: string; mobile: string }) =>
    `<li>${escapeHtml(m.name)}, ${escapeHtml(m.email)}, ${escapeHtml(m.mobile)}</li>`;

  const html = emailLayout(`
    <h1 style="${EMAIL_HEADING}">Your matches from ${escapeHtml(opts.eventName)}</h1>
    <p>Hi ${escapeHtml(opts.memberName)},</p>
    <p>Here's how ${dateStr} turned out. Contact details are only shared for people you both matched with.</p>

    ${
      opts.dateMatches.length
        ? `<h2 style="${EMAIL_SUBHEADING}color:#7A9A2E;">Date matches</h2><ul>${opts.dateMatches.map(listItem).join('')}</ul>`
        : ''
    }
    ${
      opts.friendMatches.length
        ? `<h2 style="${EMAIL_SUBHEADING}color:#D98A1E;">Friend matches</h2><ul>${opts.friendMatches.map(listItem).join('')}</ul>`
        : ''
    }

    <p>The FastMatch Team</p>
  `);

  return { subject: `Your matches from ${oneLine(opts.eventName)}`, html };
}

/** No mutual matches: Gil's wording (4 Oct), to everyone checked in without one. */
function noMatchesEmail(opts: { memberName: string; eventName: string; eventsUrl: string }) {
  const html = emailLayout(`
    <h1 style="${EMAIL_HEADING}">Your results from ${escapeHtml(opts.eventName)}</h1>
    <p>Hi ${escapeHtml(opts.memberName)},</p>
    <p>Sorry you did not have any mutual matches this time around. This could be because you didn't choose enough people or they didn't choose you.</p>
    <p><strong>…BUT DON'T STOP NOW!</strong></p>
    <p>Our research over the years analyzing thousands of events has shown that members usually meet someone special after attending about 6 events.</p>
    <p>So book into another event and keep trying!!</p>
    <p style="margin:20px 0;"><a href="${opts.eventsUrl}" style="${BUTTON}">Upcoming events</a></p>
    <p>The FastMatch Team</p>
  `);
  return { subject: `Your results from ${oneLine(opts.eventName)}`, html };
}
