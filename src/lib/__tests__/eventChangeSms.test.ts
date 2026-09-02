import { describe, it, expect } from 'vitest';
import { eventChangeSms, type EventChange } from '@/lib/emails/eventEmails';
import { withOptOut, SMS_OPT_OUT } from '@/lib/sms/send';

const base: EventChange = {
  eventName: '28-40 years',
  themeName: 'professional speed dating',
  ageMin: 28,
  ageMax: 40,
  oldVenue: 'Soultrap',
  newVenue: 'GG Bar',
  newVenueFull: 'GG Bar, 23 Campbell St Surry Hills',
  oldStartsAt: new Date('2026-07-23T09:30:00.000Z'), // 23/07/26 7.30pm Sydney
  newStartsAt: new Date('2026-07-30T10:30:00.000Z'), // 30/07/26 8.30pm Sydney
  venueChanged: false,
  timeChanged: false,
  cancelled: false,
};

/** GSM-7 segment count — what Cellcast bills per recipient. */
const segments = (t: string) => (t.length <= 160 ? 1 : Math.ceil(t.length / 153));

describe('eventChangeSms — Gil\'s approved wording', () => {
  it('date/time change', () => {
    // A time-only move means the venue did not change, so both sides name the
    // same place — exactly as in Gil's example.
    const sms = eventChangeSms({ ...base, newVenue: 'Soultrap', timeChanged: true });
    expect(sms).toBe(
      'Your fastmatch event on 23/07/26 at 7.30pm at Soultrap has been changed to 30/07/26 at 8.30pm at Soultrap.'
    );
  });

  it('cancellation', () => {
    expect(eventChangeSms({ ...base, cancelled: true })).toBe(
      'Your fastmatch event on 23/07/26 at 7.30pm at Soultrap has been cancelled. ' +
        'Sorry for the inconvenience. We will contact you shortly by email.'
    );
  });

  it('venue change names the new venue WITH its street address', () => {
    expect(eventChangeSms({ ...base, venueChanged: true })).toBe(
      'Your fastmatch event on 23/07/26 at 7.30pm at Soultrap has been moved to ' +
        '30/07/26 at 8.30pm at GG Bar, 23 Campbell St Surry Hills.'
    );
  });

  it('a venue AND time move uses the venue wording, with both new details', () => {
    const sms = eventChangeSms({ ...base, venueChanged: true, timeChanged: true });
    expect(sms).toContain('has been moved to 30/07/26 at 8.30pm');
    expect(sms).toContain('23 Campbell St Surry Hills');
  });

  it('every variant identifies the booking the same way', () => {
    for (const c of [
      { ...base, timeChanged: true },
      { ...base, venueChanged: true },
      { ...base, cancelled: true },
    ]) {
      expect(eventChangeSms(c).startsWith('Your fastmatch event on 23/07/26 at 7.30pm at Soultrap')).toBe(true);
    }
  });

  // The whole point of the shorter wording: one SMS, not two. Halves the cost.
  it('every variant fits in ONE SMS', () => {
    for (const [label, c] of [
      ['time', { ...base, timeChanged: true }],
      ['venue', { ...base, venueChanged: true }],
      ['cancel', { ...base, cancelled: true }],
      ['both', { ...base, venueChanged: true, timeChanged: true }],
    ] as const) {
      const sms = eventChangeSms(c);
      expect(segments(sms), `${label}: ${sms.length} chars`).toBe(1);
    }
  });

  it('stays plain GSM-7 — Unicode would cut the limit to 70 characters', () => {
    expect(/[^\x00-\x7F]/.test(eventChangeSms({ ...base, venueChanged: true }))).toBe(false);
  });
});

/**
 * Marketing SMS must carry an opt-out (Spam Act 2003). Transactional messages
 * must NOT — inviting someone to opt out of the text telling them their event
 * moved would be actively harmful.
 */
describe('withOptOut — marketing SMS only', () => {
  it('appends the opt-out line', () => {
    expect(withOptOut('Speed dating this Friday!')).toBe(`Speed dating this Friday!\n${SMS_OPT_OUT}`);
  });

  it("doesn't double up when the admin already wrote one", () => {
    const body = 'Speed dating Friday! Text STOP to unsubscribe';
    expect(withOptOut(body)).toBe(body);
  });

  it('leaves an empty body alone rather than sending a bare opt-out', () => {
    expect(withOptOut('   ')).toBe('');
  });

  it('is NOT applied to the event-change SMS', () => {
    expect(eventChangeSms({ ...base, timeChanged: true })).not.toContain('STOP');
  });
});
