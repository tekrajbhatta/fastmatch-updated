import { describe, it, expect } from 'vitest';
import { canRate, canMatch, rosterCountLabel } from '@/lib/ratingAudience';
import { checkInStepsHtml, bookingConfirmationEmail, eventReminderEmail } from '@/lib/emails/eventEmails';
import { friendWelcomeEmail } from '@/lib/emails/friendEmail';
import { checkNewEvent, checkEventEdit } from '@/lib/eventInput';

/**
 * Batch 1 of Gil's second round: who members see and rate on the night, and
 * the step-by-step check-in instructions in the emails.
 */
describe('who members see and rate (Gil: "show only M or F")', () => {
  it('on an "Opposite gender only" night, men rate women and women rate men', () => {
    expect(canRate('OPPOSITE_GENDER', 'MALE', 'FEMALE')).toBe(true);
    expect(canRate('OPPOSITE_GENDER', 'FEMALE', 'MALE')).toBe(true);
    expect(canRate('OPPOSITE_GENDER', 'MALE', 'MALE')).toBe(false);
    expect(canRate('OPPOSITE_GENDER', 'FEMALE', 'FEMALE')).toBe(false);
  });

  it('on an "Everyone" night, anyone can rate anyone', () => {
    expect(canRate('EVERYONE', 'MALE', 'MALE')).toBe(true);
    expect(canRate('EVERYONE', 'FEMALE', 'MALE')).toBe(true);
  });

  it('two men or two women never match on an "Opposite gender only" night', () => {
    expect(canMatch('OPPOSITE_GENDER', 'MALE', 'MALE')).toBe(false);
    expect(canMatch('OPPOSITE_GENDER', 'MALE', 'FEMALE')).toBe(true);
    expect(canMatch('EVERYONE', 'FEMALE', 'FEMALE')).toBe(true);
  });

  it('the list says who it shows', () => {
    expect(rosterCountLabel('OPPOSITE_GENDER', 'MALE', 5)).toBe('5 women checked in.');
    expect(rosterCountLabel('OPPOSITE_GENDER', 'FEMALE', 1)).toBe('1 man checked in.');
    expect(rosterCountLabel('EVERYONE', 'MALE', 10)).toBe('10 checked in.');
  });

  it('new events default to "Opposite gender only"; an edit leaves it alone unless it is changed', () => {
    const base = {
      themeId: 't1', name: '28-40 years', startsAt: '2026-11-06T08:30:00.000Z', cityId: 'c1', venueId: 'v1',
      ageMin: 28, ageMax: 40, cost: 49, maxMen: 12, maxWomen: 12,
    };
    const created = checkNewEvent(base);
    expect(created.ok && created.data.ratingAudience).toBe('OPPOSITE_GENDER');
    const everyone = checkNewEvent({ ...base, ratingAudience: 'EVERYONE' });
    expect(everyone.ok && everyone.data.ratingAudience).toBe('EVERYONE');
    const edit = checkEventEdit({ cost: 45 }, { ageMin: 28, ageMax: 40 });
    expect(edit.ok && 'ratingAudience' in edit.data).toBe(false);
    expect(checkNewEvent({ ...base, ratingAudience: 'MEN_ONLY' }).ok).toBe(false);
  });
});

describe('how to check in on the night (Gil: the old line was unclear)', () => {
  const url = 'https://fastmatch.test/events/e1/checkin';

  it('spells out the steps, with the check-in button', () => {
    const html = checkInStepsHtml(url);
    expect(html).toContain('How to check in on the night');
    expect(html).toContain('Check-in opens an hour before the start');
    expect(html).toContain('Confirm &amp; check in');
    expect(html).toContain('Submit matches</strong> before midnight');
    expect(html).toContain(`href="${url}"`);
  });

  it('is in the booking, friend-booking and reminder emails, and the old line is gone', () => {
    const startsAt = new Date('2026-11-27T08:30:00Z');
    const timeZone = 'Australia/Sydney';
    const emails = [
      bookingConfirmationEmail({ memberName: 'Ann', eventName: 'Ages 29 to 42', venue: 'The Hangout Bar', startsAt, checkInUrl: url, timeZone }).html,
      friendWelcomeEmail({ friendName: 'Bob', bookedByName: 'Ann', eventName: 'Ages 29 to 42', venue: 'The Hangout Bar', startsAt, timeZone, setPasswordUrl: 'https://fastmatch.test/set-password?token=x', checkInUrl: url }).html,
      eventReminderEmail({ memberName: 'Ann', eventName: 'Ages 29 to 42', venue: 'The Hangout Bar', startsAt, timeZone, checkInUrl: url }).html,
    ];
    for (const html of emails) {
      expect(html).toContain('How to check in on the night');
      expect(html).toContain(`href="${url}"`);
      expect(html).not.toContain('show this link (or the QR code at the venue)');
    }
  });
});
