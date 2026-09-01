import { describe, it, expect } from 'vitest';
import { eventChangeSms, type EventChange } from '@/lib/emails/eventEmails';

const base: EventChange = {
  eventName: '28-40 years',
  themeName: 'professional speed dating',
  ageMin: 28,
  ageMax: 40,
  oldVenue: 'Soultrap Bar',
  newVenue: 'GG Bar',
  oldStartsAt: new Date('2025-09-23T09:20:00.000Z'), // 7:20pm Sydney
  newStartsAt: new Date('2025-09-25T10:00:00.000Z'), // 8:00pm Sydney
  venueChanged: false,
  timeChanged: false,
  cancelled: false,
};

/** GSM-7 segment count — what Cellcast actually bills per recipient. */
function segments(text: string): number {
  const n = text.length;
  return n <= 160 ? 1 : Math.ceil(n / 153);
}

describe('eventChangeSms', () => {
  it("matches Gil's requested wording when venue AND time both move", () => {
    const sms = eventChangeSms({ ...base, venueChanged: true, timeChanged: true });
    expect(sms).toBe(
      'Soultrap Bar professional speed dating 28-40 years on Tue 23 Sept 2025 at 7:20pm ' +
        'has now been changed to GG Bar on Thu 25 Sept 2025 at 8:00pm. ' +
        'If any issues please contact gil@fastmatch.com.au'
    );
  });

  it('names only the time when only the time moved', () => {
    const sms = eventChangeSms({ ...base, timeChanged: true });
    expect(sms).toContain('has now been changed to Thu 25 Sept 2025 at 8:00pm');
    // Saying "changed to Soultrap Bar" when the venue didn't move reads as an error.
    expect(sms).not.toContain('changed to GG Bar');
  });

  it('names only the venue when only the venue moved', () => {
    const sms = eventChangeSms({ ...base, venueChanged: true });
    expect(sms).toContain('has now been changed to GG Bar.');
    expect(sms).not.toContain('Thu 25 Sept 2025');
  });

  it('always identifies the booking by its ORIGINAL venue, theme, ages and time', () => {
    const sms = eventChangeSms({ ...base, timeChanged: true });
    expect(sms.startsWith('Soultrap Bar professional speed dating 28-40 years on Tue 23 Sept 2025 at 7:20pm')).toBe(true);
  });

  it('uses distinct wording for a cancellation', () => {
    const sms = eventChangeSms({ ...base, cancelled: true });
    expect(sms).toContain('has been CANCELLED');
    expect(sms).not.toContain('changed to');
  });

  it('always carries the contact address', () => {
    for (const c of [
      { ...base, timeChanged: true },
      { ...base, venueChanged: true },
      { ...base, cancelled: true },
    ]) {
      expect(eventChangeSms(c)).toContain('If any issues please contact gil@fastmatch.com.au');
    }
  });

  // Gil should know the cost of the detail he asked for: this is billed per
  // segment, per recipient. Locked in so a future edit can't quietly triple it.
  it('costs no more than 2 SMS segments per recipient', () => {
    const worst = eventChangeSms({ ...base, venueChanged: true, timeChanged: true });
    expect(segments(worst)).toBeLessThanOrEqual(2);
  });

  it('stays plain GSM-7 — no curly quotes or dashes that would force Unicode', () => {
    const sms = eventChangeSms({ ...base, venueChanged: true, timeChanged: true });
    // Unicode encoding would drop the per-segment limit from 153 to 67.
    expect(/[^\x00-\x7F]/.test(sms)).toBe(false);
  });
});
