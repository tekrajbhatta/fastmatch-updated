import { describe, it, expect } from 'vitest';
import { venueFill, venueWouldReplace, bookNowFill, bookNowEventId } from '@/lib/campaigns/blastFill';
import { emailLayout, EMAIL_FRAME } from '@/lib/emails/layout';
import { renderCampaignEmailHtml, resolveCampaignEmailHtml } from '@/lib/emails/campaignEmail';
import { bookingConfirmationEmail } from '@/lib/emails/eventEmails';
import { passwordResetEmail } from '@/lib/emails/passwordEmail';
import { matchResultsEmail } from '@/lib/emails/matchResultsEmail';

/**
 * Gil round 2, batch 5: the venue's description goes into Free text (item 1),
 * a frame around every email (item 2), and choosing the event for Book Now
 * (item 19).
 */
const venue = {
  name: 'Soultrap', address: '1 Crown St, Surry Hills', phone: '02 9000 0000', websiteUrl: 'https://soultrap.test',
  imageUrl: 'https://img.test/soultrap.jpg', logoUrl: 'https://img.test/logo.png', description: 'A cosy bar with a rooftop.',
};
const empty = { eventDetailsText: '', freeText: '', photoUrl: '' };

describe('"Fill from a venue" (item 1)', () => {
  it('puts the description into Free text, not under the address in Event details', () => {
    const fill = venueFill(venue);
    expect(fill.freeText).toBe('A cosy bar with a rooftop.');
    expect(fill.eventDetailsText).toContain('Soultrap');
    expect(fill.eventDetailsText).toContain('1 Crown St, Surry Hills');
    expect(fill.eventDetailsText).not.toContain('rooftop');
    expect(fill).toMatchObject({ photoUrl: venue.imageUrl, venueLogoUrl: venue.logoUrl });
  });

  it('leaves Free text and the photo alone when the venue has neither; clears the old logo', () => {
    const fill = venueFill({ ...venue, description: '  ', imageUrl: null, logoUrl: null });
    expect('freeText' in fill).toBe(false);
    expect('photoUrl' in fill).toBe(false);
    expect(fill.venueLogoUrl).toBe('');
  });

  it('asks before replacing only what already holds something', () => {
    expect(venueWouldReplace(venue, empty)).toEqual([]);
    expect(venueWouldReplace(venue, { eventDetailsText: 'x', freeText: 'Come along!', photoUrl: 'https://img.test/a.jpg' }))
      .toEqual(['event details', 'free text', 'photo']);
    // A venue without a description doesn't touch the free text, so doesn't ask about it.
    expect(venueWouldReplace({ ...venue, description: null, imageUrl: null }, { eventDetailsText: '', freeText: 'Come along!', photoUrl: 'https://img.test/a.jpg' }))
      .toEqual([]);
  });
});

describe('"Book Now goes to" an event (item 19)', () => {
  const ev = { id: 'ev1', name: 'Ages 25 to 45 years', theme: { name: 'Cocktail speed dating' } };

  it('links Book Now to the event, and fills an empty subject and heading with its type and name', () => {
    expect(bookNowFill(ev, 'https://5minutedating.com.au/', { subject: '', heading: ' ' })).toEqual({
      bookingLink: 'https://5minutedating.com.au/events/ev1',
      subject: 'Cocktail speed dating, Ages 25 to 45 years',
      heading: 'Cocktail speed dating',
    });
  });

  it('never overwrites a subject or heading already written', () => {
    expect(bookNowFill(ev, 'https://x.test', { subject: 'Last places!', heading: 'This Saturday' })).toEqual({ bookingLink: 'https://x.test/events/ev1' });
  });

  it('doesn\'t repeat a type the name already has', () => {
    const full = { id: 'ev2', name: 'Professional Speed Dating, 28 to 40 years', theme: { name: 'Professionals speed dating' } };
    expect(bookNowFill(full, 'https://x.test', { subject: '', heading: 'x' }).subject).toBe('Professional Speed Dating, 28 to 40 years');
  });

  it('recognises the event an existing link goes to', () => {
    expect(bookNowEventId('https://5minutedating.com.au/events/ev2/', ['ev1', 'ev2'])).toBe('ev2');
    expect(bookNowEventId('https://5minutedating.com.au/events', ['ev1'])).toBe('');
    expect(bookNowEventId('', ['ev1'])).toBe('');
  });
});

describe('a frame around every email (item 2)', () => {
  const startsAt = new Date('2026-11-10T08:30:00.000Z');
  it('is on the site\'s emails and on blasts', () => {
    const emails = [
      emailLayout('<p>Hello</p>'),
      bookingConfirmationEmail({ memberName: 'Ann', eventName: 'Speed dating, 28-40 years', venue: 'Bar', startsAt, timeZone: 'Australia/Sydney', checkInUrl: 'https://x.test/c' }).html,
      passwordResetEmail({ memberName: 'Ann', resetUrl: 'https://x.test/r', validMinutes: 30 }).html,
      matchResultsEmail({ memberName: 'Ann', eventName: 'x', eventDate: startsAt, timeZone: 'Australia/Sydney', dateMatches: [], friendMatches: [], eventsUrl: 'https://x.test/events' }).html,
      renderCampaignEmailHtml({ heading: 'Hi', freeText: 'Text', unsubscribeUrl: 'https://x.test/u' }),
    ];
    for (const html of emails) expect(html).toContain(EMAIL_FRAME);
    expect(EMAIL_FRAME).toBe('border:2px solid #3D1E6D;');
  });

  it('an admin\'s own pasted HTML is still sent exactly as written', () => {
    expect(resolveCampaignEmailHtml({ emailBody: '<p>Mine</p>' }, 'https://x.test/u')).toBe('<p>Mine</p>');
  });
});
