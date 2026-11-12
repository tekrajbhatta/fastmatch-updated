import { describe, it, expect } from 'vitest';
import { RATING_AUDIENCE_OPTIONS, noMatches, canRate, canMatch, NO_MATCHES_MEMBER_MESSAGE } from '@/lib/ratingAudience';
import { switchesNoMatchesTooLate, checkEventEdit, NO_MATCHES_SWITCH_MESSAGE } from '@/lib/eventInput';
import { bookingConfirmationEmail, eventReminderEmail } from '@/lib/emails/eventEmails';
import { friendWelcomeEmail } from '@/lib/emails/friendEmail';
import { eventsDueForResults } from '@/lib/nightlyResults';

/**
 * Events with no check-in or matches (Gil: "a day at the races … no check in
 * required, no matches are chosen and nothing calculated"; the user, 13 Nov:
 * a third choice under "On the night, members see and rate").
 */

describe('the third choice', () => {
  it('is offered on the event form, worded for Gil', () => {
    expect(RATING_AUDIENCE_OPTIONS.map((o) => o.label)).toEqual(['Opposite gender only', 'Everyone', 'No check-in or matches']);
    expect(RATING_AUDIENCE_OPTIONS[2].hint).toMatch(/day at the races/);
    expect(checkEventEdit({ ratingAudience: 'NO_MATCHES' }, { ageMin: 25, ageMax: 65 }).ok).toBe(true);
  });

  it('means nobody rates or matches anyone', () => {
    expect(noMatches({ ratingAudience: 'NO_MATCHES' })).toBe(true);
    expect(noMatches({ ratingAudience: 'EVERYONE' })).toBe(false);
    expect(canRate('NO_MATCHES', 'MALE', 'FEMALE')).toBe(false);
    expect(canMatch('NO_MATCHES', 'MALE', 'FEMALE')).toBe(false);
    expect(NO_MATCHES_MEMBER_MESSAGE).toMatch(/no check-in/);
  });

  it('is left out by the hourly results job', () => {
    expect(eventsDueForResults(new Date('2026-11-29T01:00:00Z'))).toMatchObject({ ratingAudience: { not: 'NO_MATCHES' } });
  });
});

describe('switching to or from it', () => {
  // 11 am in Sydney on 28 Nov: check-in opens at 10 am.
  const event = { ratingAudience: 'OPPOSITE_GENDER', startsAt: new Date('2026-11-28T00:00:00Z'), city: { name: 'Sydney' } };
  const before = new Date('2026-11-27T22:59:00Z');
  const after = new Date('2026-11-27T23:00:00Z');

  it('is allowed until check-in opens, an hour before the start', () => {
    expect(switchesNoMatchesTooLate(event, 'NO_MATCHES', before)).toBe(false);
    expect(switchesNoMatchesTooLate({ ...event, ratingAudience: 'NO_MATCHES' }, 'EVERYONE', before)).toBe(false);
  });

  it('is refused once check-in has opened, either way', () => {
    expect(switchesNoMatchesTooLate(event, 'NO_MATCHES', after)).toBe(true);
    expect(switchesNoMatchesTooLate({ ...event, ratingAudience: 'NO_MATCHES' }, 'OPPOSITE_GENDER', after)).toBe(true);
    expect(NO_MATCHES_SWITCH_MESSAGE).toMatch(/already opened/);
  });

  it('leaves every other edit alone', () => {
    expect(switchesNoMatchesTooLate(event, undefined, after)).toBe(false);
    expect(switchesNoMatchesTooLate(event, 'OPPOSITE_GENDER', after)).toBe(false);
    expect(switchesNoMatchesTooLate(event, 'EVERYONE', after)).toBe(false);
    expect(switchesNoMatchesTooLate({ ...event, ratingAudience: 'NO_MATCHES' }, 'NO_MATCHES', after)).toBe(false);
  });
});

describe('the emails', () => {
  const when = { startsAt: new Date('2026-11-28T00:00:00Z'), timeZone: 'Australia/Sydney' };
  const url = 'https://fastmatch.com.au/events/e1/checkin';

  it('booking confirmation: no check-in steps, button or results line', () => {
    const base = { memberName: 'Anna', eventName: 'A Day at the Races, All ages', venue: 'Randwick Racecourse', ...when };
    const none = bookingConfirmationEmail({ ...base, checkInUrl: null }).html;
    expect(none).not.toContain('How to check in');
    expect(none).not.toContain('/checkin');
    expect(none).not.toContain('emailed to you after midnight');
    expect(none).toContain("You're confirmed for");
    const usual = bookingConfirmationEmail({ ...base, checkInUrl: url }).html;
    expect(usual).toContain('How to check in to the event');
    expect(usual).toContain(url);
  });

  it('reminder: "your event", not speed dating, and nothing about checking in', () => {
    const base = { memberName: 'Anna', eventName: 'A Day at the Races, All ages', venue: 'Randwick Racecourse', ...when };
    const none = eventReminderEmail({ ...base, checkInUrl: null });
    expect(none.subject).toBe('Anna, your event is on Saturday 28 November!');
    expect(none.html).not.toContain('speed dating');
    expect(none.html).not.toContain('checked in');
    expect(none.html).not.toContain('How to check in');
    expect(none.html).toContain('Remember to arrive at least 10 minutes early.');
    const usual = eventReminderEmail({ ...base, checkInUrl: url });
    expect(usual.subject).toBe('Anna, you’re speed dating on Saturday 28 November!'.replace('’', "'"));
    expect(usual.html).toContain("so you're checked in and ready to go");
  });

  it('friend email: no check-in, and "a FastMatch event"', () => {
    const base = { friendName: 'Joe', bookedByName: 'Anna', eventName: 'A Day at the Races', venue: 'Randwick', ...when, setPasswordUrl: 'https://x/set' };
    const none = friendWelcomeEmail({ ...base, checkInUrl: null });
    expect(none.subject).toBe('Anna has booked you into a FastMatch event');
    expect(none.html).toContain('Set a password so you can log in to FastMatch:');
    expect(none.html).not.toContain('How to check in');
    const usual = friendWelcomeEmail({ ...base, checkInUrl: url });
    expect(usual.subject).toBe('Anna has booked you into FastMatch speed dating');
    expect(usual.html).toContain('check in for the event and choose your matches afterwards');
  });
});
