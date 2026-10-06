import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { bookingConfirmationEmail, eventReminderEmail, eventChangeEmail, type EventChange } from '@/lib/emails/eventEmails';
import { friendWelcomeEmail, tellAFriendEmail } from '@/lib/emails/friendEmail';
import { matchResultsEmail } from '@/lib/emails/matchResultsEmail';
import { passwordResetEmail } from '@/lib/emails/passwordEmail';
import { welcomeVerificationEmail } from '@/lib/emails/welcomeEmail';
import { memberFeedbackEmail } from '@/lib/emails/feedbackEmail';
import { resolveCampaignEmailHtml } from '@/lib/emails/campaignEmail';
import { sendEmail } from '@/lib/emails/send';
import { POST as contactUs } from '@/app/api/contact-us/route';

// The Contact Us route is exercised for real; only the send and the
// database-backed rate limit are stood in for.
vi.mock('@/lib/emails/send', () => ({ sendEmail: vi.fn(async () => {}) }));
vi.mock('@/lib/rateLimit', () => ({
  clientIp: () => '203.0.113.7',
  rateKey: (prefix: string, value: string) => `${prefix}:${value}`,
  LIMITS: { contactIp: { limit: 5, windowMs: 60 * 60 * 1000 } },
  hitRateLimit: async () => ({ allowed: true }),
}));

/** What someone could type as a name: a link, an ampersand and quotes. Labelled per field. */
const evil = (field: string) => `<a href="https://evil.test/${field}">${field}</a> & "q"`;
const escaped = (field: string) => `&lt;a href=&quot;https://evil.test/${field}&quot;&gt;${field}&lt;/a&gt; &amp; &quot;q&quot;`;
/** A line break in a subject is how an extra header gets added. */
const HEADER_TRICK = 'Ann\r\nBcc: everyone@evil.test';

function expectEscaped(html: string, ...fields: string[]) {
  // Nothing typed ever arrives as a working link...
  expect(html).not.toContain('<a href="https://evil.test');
  expect(html).not.toContain('href="https://evil.test');
  // ...but every field is still there, as text.
  for (const field of fields) expect(html, field).toContain(escaped(field));
}

const startsAt = new Date('2026-11-10T08:30:00.000Z'); // 7:30pm in Sydney
const timeZone = 'Australia/Sydney';

describe('booking and event emails', () => {
  it('booking confirmation: every name is text, the subject is plain and on one line', () => {
    const opts = {
      memberName: evil('member'), eventName: evil('event'), venue: evil('venue'), startsAt, timeZone, zoneNote: evil('zone'),
      checkInUrl: 'https://fastmatch.test/events/e1/checkin',
    };
    const { html, subject } = bookingConfirmationEmail(opts);
    expectEscaped(html, 'member', 'event', 'venue', 'zone');
    expect(html).toContain('href="https://fastmatch.test/events/e1/checkin"');
    // A subject is plain text: shown exactly as typed, never as "&amp;".
    expect(subject).toBe(`You're booked: ${evil('event')}`);
    expect(bookingConfirmationEmail({ ...opts, eventName: HEADER_TRICK }).subject).toBe("You're booked: Ann Bcc: everyone@evil.test");
  });

  it('reminder', () => {
    const opts = { memberName: evil('member'), eventName: evil('event'), venue: evil('venue'), startsAt, timeZone, zoneNote: evil('zone'), checkInUrl: 'https://fastmatch.test/events/e1/checkin' };
    const { html, subject } = eventReminderEmail(opts);
    expectEscaped(html, 'member', 'event', 'venue', 'zone');
    // The night's steps and the check-in button, as in the booking email.
    expect(html).toContain('href="https://fastmatch.test/events/e1/checkin"');
    expect(subject.startsWith(`${evil('member')}, you're speed dating on`)).toBe(true);
    expect(eventReminderEmail({ ...opts, memberName: HEADER_TRICK }).subject).not.toMatch(/[\r\n]/);
  });

  const change: EventChange & { memberName: string } = {
    memberName: evil('member'), eventName: evil('event'), themeName: evil('theme'), ageMin: 28, ageMax: 40,
    oldVenue: evil('oldvenue'), newVenue: evil('newvenue'), newVenueFull: evil('newvenuefull'),
    oldStartsAt: startsAt, newStartsAt: new Date('2026-11-11T08:30:00.000Z'), timeZone, zoneNote: evil('zone'),
    venueChanged: true, timeChanged: true, cancelled: false,
  };

  it('event change', () => {
    const { html, subject } = eventChangeEmail(change);
    expectEscaped(html, 'member', 'theme', 'oldvenue', 'newvenue', 'zone');
    expect(subject).toBe(`Change to your event: ${evil('event')}`);
    expect(eventChangeEmail({ ...change, eventName: HEADER_TRICK }).subject).not.toMatch(/[\r\n]/);
  });

  it('event cancelled', () => {
    const { html, subject } = eventChangeEmail({ ...change, cancelled: true });
    expectEscaped(html, 'member', 'theme', 'oldvenue', 'zone');
    expect(subject).toBe(`Cancelled: ${evil('event')}`);
    expect(eventChangeEmail({ ...change, cancelled: true, eventName: HEADER_TRICK }).subject).not.toMatch(/[\r\n]/);
  });
});

describe('friend emails', () => {
  it('a friend booked in: their name, the booker’s, the event’s and the venue’s are all text', () => {
    const opts = {
      friendName: evil('friend'), bookedByName: evil('booker'), eventName: evil('event'), venue: evil('venue'),
      startsAt, timeZone, zoneNote: evil('zone'),
      setPasswordUrl: 'https://fastmatch.test/set-password?token=abc', checkInUrl: 'https://fastmatch.test/events/e1/checkin',
    };
    const { html, subject } = friendWelcomeEmail(opts);
    expectEscaped(html, 'friend', 'booker', 'event', 'venue', 'zone');
    expect(html).toContain('href="https://fastmatch.test/set-password?token=abc"');
    expect(subject).toBe(`${evil('booker')} has booked you into FastMatch speed dating`);
    expect(friendWelcomeEmail({ ...opts, bookedByName: HEADER_TRICK }).subject).toBe('Ann Bcc: everyone@evil.test has booked you into FastMatch speed dating');
  });

  it('Tell A Friend', () => {
    const opts = { friendName: evil('friend'), inviterName: evil('inviter'), setPasswordUrl: 'https://fastmatch.test/set-password?token=abc' };
    const { html, subject } = tellAFriendEmail(opts);
    expectEscaped(html, 'friend', 'inviter');
    expect(subject).toBe(`${evil('inviter')} has registered you with FastMatch`);
    expect(tellAFriendEmail({ ...opts, inviterName: HEADER_TRICK }).subject).not.toMatch(/[\r\n]/);
  });
});

describe('match results', () => {
  it('lists each match exactly as they typed their details, as text', () => {
    const match = (who: string) => ({ name: evil(`${who}-name`), email: evil(`${who}-email`), mobile: evil(`${who}-mobile`) });
    const opts = { memberName: evil('member'), eventName: evil('event'), eventDate: startsAt, timeZone, dateMatches: [match('date')], friendMatches: [match('friend')], eventsUrl: 'https://fastmatch.test/events' };
    const { html, subject } = matchResultsEmail(opts);
    expectEscaped(html, 'member', 'event', 'date-name', 'date-email', 'date-mobile', 'friend-name', 'friend-email', 'friend-mobile');
    expect(subject).toBe(`Your matches from ${evil('event')}`);
    expect(matchResultsEmail({ ...opts, eventName: HEADER_TRICK }).subject).not.toMatch(/[\r\n]/);
  });

  it('with no mutual match, Gil\'s "don\'t stop now" email, escaped too', () => {
    const opts = { memberName: evil('member'), eventName: evil('event'), eventDate: startsAt, timeZone, dateMatches: [], friendMatches: [], eventsUrl: 'https://fastmatch.test/events' };
    const { html, subject } = matchResultsEmail(opts);
    expectEscaped(html, 'member', 'event');
    expect(subject).toBe(`Your results from ${evil('event')}`);
    expect(html).toContain('Sorry you did not have any mutual matches this time around.');
    expect(html).toContain("BUT DON'T STOP NOW!");
    expect(html).toContain('members usually meet someone special after attending about 6 events');
    expect(html).toContain('href="https://fastmatch.test/events"');
  });
});

describe('account emails', () => {
  it('password reset', () => {
    const { html } = passwordResetEmail({ memberName: evil('member'), resetUrl: 'https://fastmatch.test/reset-password?token=abc', validMinutes: 60 });
    expectEscaped(html, 'member');
    expect(html).toContain('href="https://fastmatch.test/reset-password?token=abc"');
  });

  it('welcome / confirm your email', () => {
    const { html } = welcomeVerificationEmail({ memberName: evil('member'), verifyUrl: 'https://fastmatch.test/verify-email?token=abc' });
    expectEscaped(html, 'member');
    expect(html).toContain('href="https://fastmatch.test/verify-email?token=abc"');
  });
});

describe('member feedback', () => {
  it('keeps the subject to one line', () => {
    const { subject } = memberFeedbackEmail({
      member: { name: HEADER_TRICK, email: 'ann@example.com', mobile: '0491 570 006' },
      event: { name: 'Speed dating\nBcc: x@evil.test', venue: 'Bar', when: 'Tue 10 Nov 2026 at 7:30pm' },
      message: 'hi',
    });
    expect(subject).toBe('Feedback from Ann Bcc: everyone@evil.test: Speed dating Bcc: x@evil.test (Tue 10 Nov 2026 at 7:30pm)');
  });
});

describe('Contact Us', () => {
  it('emails what the visitor typed as text, with the subject on one line', async () => {
    const send = vi.mocked(sendEmail);
    send.mockClear();
    const res = await contactUs(
      new NextRequest('http://localhost/api/contact-us', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: `${evil('visitor')}\r\nBcc: everyone@evil.test`, email: 'visitor@example.com', message: `${evil('message')}\nSecond line` }),
      }),
    );
    expect(res.status).toBe(200);
    const { subject, html } = send.mock.calls[0][0];
    expectEscaped(html, 'visitor', 'message');
    expect(html).toContain(`${escaped('message')}\nSecond line`);
    expect(subject).toBe(`Contact Us: ${evil('visitor')} Bcc: everyone@evil.test`);
  });
});

describe('blast email', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const unsubscribe = 'https://fastmatch.test/unsubscribe?token=t';

  it('heading, free text and event details are plain text: escaped, line breaks kept', () => {
    const html = resolveCampaignEmailHtml(
      {
        heading: `PROFESSIONAL SPEED DATING\n${evil('heading')}`,
        freeText: `First paragraph ${evil('free')}\nSecond paragraph`,
        eventDetailsText: `${evil('details')}\n45 Jones St, Ultimo`,
      },
      unsubscribe,
    );
    expectEscaped(html, 'heading', 'free', 'details');
    // A heading line break is a <br/>, each free-text line its own paragraph,
    // and the details keep theirs (the block is white-space:pre-line).
    expect(html).toContain(`PROFESSIONAL SPEED DATING<br/>${escaped('heading')}</h1>`);
    expect(html).toContain(`<p style="margin:0 0 14px;">First paragraph ${escaped('free')}</p><p style="margin:0 0 14px;">Second paragraph</p>`);
    expect(html).toMatch(/white-space:pre-line;[^>]*>[^<]*&lt;a href=&quot;https:\/\/evil\.test\/details/);
    expect(html).toContain(`${escaped('details')}\n45 Jones St, Ultimo</div>`);
  });

  it('a booking link that isn’t http(s) falls back to the events page', () => {
    vi.stubEnv('APP_URL', 'https://fastmatch.test/');
    for (const bookingLink of ['javascript:alert(document.cookie)', ' JavaScript:alert(1)', 'data:text/html,<script>alert(1)</script>']) {
      const html = resolveCampaignEmailHtml({ heading: 'Hi', bookingLink }, unsubscribe);
      expect(html, bookingLink).not.toMatch(/javascript:|data:text/i);
      expect(html, bookingLink).toContain('<a href="https://fastmatch.test/events" style=');
    }
  });

  it('a booking link can’t break out of its attribute', () => {
    const html = resolveCampaignEmailHtml({ heading: 'Hi', bookingLink: 'https://fastmatch.test/e/1?a=1&b=2" onclick="alert(1)' }, unsubscribe);
    expect(html).not.toContain('" onclick="');
    expect(html).toContain('href="https://fastmatch.test/e/1?a=1&amp;b=2&quot; onclick=&quot;alert(1)"');
  });

  it('images only ever load from http(s) or this site, and can’t add attributes', () => {
    vi.stubEnv('APP_URL', 'https://fastmatch.test');
    const html = resolveCampaignEmailHtml(
      {
        heading: 'Hi',
        photoUrl: 'javascript:alert(1)',
        bannerImageUrl: 'data:image/svg+xml,<svg onload=alert(1)>',
        venueLogoUrl: '//evil.test/logo.png',
      },
      unsubscribe,
    );
    expect(html).not.toMatch(/javascript:|data:image|evil\.test/);
    expect(html).not.toContain('width="330"'); // no photo
    expect(html).not.toContain('width="160"'); // no venue logo
    expect(html).toContain('src="https://fastmatch.test/logo.png"'); // the default banner instead

    const quoted = resolveCampaignEmailHtml({ heading: 'Hi', photoUrl: 'https://fastmatch.test/p.jpg" onerror="alert(1)' }, unsubscribe);
    expect(quoted).not.toContain('" onerror="');
    expect(quoted).toContain('src="https://fastmatch.test/p.jpg&quot; onerror=&quot;alert(1)"');

    const uploaded = resolveCampaignEmailHtml({ heading: 'Hi', bannerImageUrl: '/api/uploads/0123abcd.jpg' }, unsubscribe);
    expect(uploaded).toContain('<img src="/api/uploads/0123abcd.jpg" alt="" style="width:100%;display:block;" />');
  });

  it('emailBody is the deliberate exception: admin-written HTML, sent as written', () => {
    const emailBody = '<p>Hi <b>there</b>, <a href="https://fastmatch.com.au/events">see the events</a></p>';
    expect(resolveCampaignEmailHtml({ emailBody, heading: evil('ignored') }, unsubscribe)).toBe(emailBody);
  });
});
