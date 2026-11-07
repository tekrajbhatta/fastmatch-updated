import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { resultsState, RESULTS_SENT_MESSAGE, RESULTS_LABEL } from '@/lib/eventResults';
import { matchResultsEmail } from '@/lib/emails/matchResultsEmail';
import { bookingConfirmationEmail, eventReminderEmail, friendShareRefundEmail } from '@/lib/emails/eventEmails';
import { friendWelcomeEmail } from '@/lib/emails/friendEmail';

/** Gil's review, 7 Nov. */

describe('closed events (resultsState)', () => {
  it('is open until the matches are worked out', () => {
    expect(resultsState({ matchesCalculated: false, matchEmailsSent: false })).toBe('open');
  });
  it('is "sent" once they are worked out and every results email has gone', () => {
    expect(resultsState({ matchesCalculated: true, matchEmailsSent: true })).toBe('sent');
    expect(RESULTS_SENT_MESSAGE).toBe('This event is closed and matches have been sent.');
    expect(RESULTS_LABEL.sent).toBe('Closed · matches sent');
  });
  it('never claims "sent" when some results emails failed', () => {
    expect(resultsState({ matchesCalculated: true, matchEmailsSent: false })).toBe('not-all-emailed');
  });
});

describe('the results email', () => {
  const base = {
    memberName: 'Ann', eventName: 'European background speed dating, Ages 29-49 SYD NSW',
    eventDate: new Date('2026-11-04T06:00:00Z'), timeZone: 'Australia/Sydney',
    friendMatches: [], eventsUrl: 'https://fastmatch.test/events',
  };

  it('ends with Gil’s line, linked to Upcoming Events, after the matches and before the sign-off', () => {
    const { html } = matchResultsEmail({ ...base, dateMatches: [{ name: 'Bob', email: 'bob@example.com', mobile: '0412345678' }] });
    expect(html).toContain('Hope you enjoyed the event and we see you at <a href="https://fastmatch.test/events">another FastMatch event</a> real soon.');
    expect(html.indexOf('bob@example.com')).toBeLessThan(html.indexOf('Hope you enjoyed the event'));
    expect(html.indexOf('Hope you enjoyed the event')).toBeLessThan(html.indexOf('The FastMatch Team'));
  });

  it('leaves the “no mutual matches” email as Gil wrote it, with its own Upcoming events button', () => {
    const { html } = matchResultsEmail({ ...base, dateMatches: [] });
    expect(html).not.toContain('Hope you enjoyed the event');
    expect(html).toContain('So book into another event and keep trying!!');
  });
});

describe('the Privacy Policy', () => {
  it('names both websites, whatever address the site is on', () => {
    const page = readFileSync(path.resolve(__dirname, '../../app/privacy/page.tsx'), 'utf8');
    expect(page).toContain('the main way we collect and share information is on our websites at 5minutedating.com.au and fastmatch.com.au.');
    expect(page).not.toContain('is our website,');
    expect(page).not.toContain('APP_URL');
    expect(page).toContain("const LAST_UPDATED = '8 November 2026';");
  });
});

/** Some events are in the day (Gil, 7 Nov): no "tonight" or "the night" where members check in. */
describe('daytime events', () => {
  const startsAt = new Date('2026-11-07T00:00:00Z');
  const timeZone = 'Australia/Sydney';
  const checkInUrl = 'https://fastmatch.test/events/e1/checkin';
  const NIGHT = /tonight|for the night|on the night/i;

  it('the emails with the check-in steps say "this event" and "the event"', () => {
    const emails = [
      bookingConfirmationEmail({ memberName: 'Ann', eventName: 'A Day at the Races, All ages', venue: 'Randwick Racecourse', startsAt, checkInUrl, timeZone }).html,
      eventReminderEmail({ memberName: 'Ann', eventName: 'A Day at the Races, All ages', venue: 'Randwick Racecourse', startsAt, timeZone, checkInUrl }).html,
      friendWelcomeEmail({ friendName: 'Bob', bookedByName: 'Ann', eventName: 'A Day at the Races, All ages', venue: 'Randwick Racecourse', startsAt, timeZone, setPasswordUrl: 'https://fastmatch.test/set-password?token=x', checkInUrl }).html,
    ];
    for (const html of emails) {
      expect(html).toContain('How to check in to the event');
      expect(html).toContain("You'll see your number for this event.");
      expect(html).not.toMatch(NIGHT);
    }
    expect(emails[2]).toContain('check in for the event and choose your matches afterwards');
  });

  it('the refund email for a friend already booked says "for the event"', () => {
    const { html } = friendShareRefundEmail({ memberName: 'Ann', friendName: 'Bob', eventName: 'A Day at the Races, All ages', startsAt, timeZone, refunded: 39, amount: 39 });
    expect(html).toContain('everything you need for the event.');
    expect(html).not.toMatch(NIGHT);
  });

  it('the check-in and booked pages say "the event" and "this event"', () => {
    const page = (f: string) => readFileSync(path.resolve(__dirname, '../../app/events/[eventId]', f), 'utf8');
    const checkin = page('checkin/page.tsx');
    expect(checkin).toContain('Please log in to check in for the event.');
    expect(checkin).toContain('Please confirm your details before you check in for the event.');
    expect(checkin).toContain('Your number for this event');
    expect(checkin).not.toMatch(/tonight's event|tonight&apos;s event|Your number tonight/);
    expect(page('booked/page.tsx')).toContain('On the day of the event, check in from an hour before the start');
  });
});
