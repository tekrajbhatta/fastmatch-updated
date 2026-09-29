import { describe, it, expect } from 'vitest';
import { timeZoneForCity, eventTimeFor } from '@/lib/timezone';
import { formatEventWhen, formatEventShort } from '@/lib/datetime';
import { bookingConfirmationEmail, eventChangeSms } from '@/lib/emails/eventEmails';

// 7:30pm in Sydney on 10 Nov 2026 (daylight saving: UTC+11).
const event = new Date('2026-11-10T08:30:00.000Z');

describe('timeZoneForCity', () => {
  it('maps every city the site offers', () => {
    // The fixed list from prisma/seed.ts — a city missing here would silently
    // fall back to Sydney time.
    for (const city of ['Sydney', 'Melbourne', 'Brisbane', 'Adelaide', 'Perth', 'Gold Coast', 'Newcastle', 'Central Coast', 'Wollongong']) {
      expect(timeZoneForCity(city), city).toMatch(/^Australia\//);
    }
  });

  it('falls back to Sydney for anything unknown', () => {
    expect(timeZoneForCity('Atlantis')).toBe('Australia/Sydney');
    expect(timeZoneForCity(null)).toBe('Australia/Sydney');
  });
});

describe('event times in the reader’s own timezone', () => {
  it('the same moment reads differently in each state', () => {
    expect(formatEventWhen(event, timeZoneForCity('Sydney'))).toBe('Tue 10 Nov 2026 at 7:30pm');
    expect(formatEventWhen(event, timeZoneForCity('Brisbane'))).toBe('Tue 10 Nov 2026 at 6:30pm'); // no DST
    expect(formatEventWhen(event, timeZoneForCity('Adelaide'))).toBe('Tue 10 Nov 2026 at 7:00pm');
    expect(formatEventWhen(event, timeZoneForCity('Perth'))).toBe('Tue 10 Nov 2026 at 4:30pm');
  });

  it('the Gold Coast follows Queensland, not NSW', () => {
    expect(formatEventShort(event, timeZoneForCity('Gold Coast'))).toBe('10/11/26 at 6.30pm');
  });

  it('the booking confirmation no longer uses the server clock', () => {
    const { html } = bookingConfirmationEmail({
      memberName: 'Ann', eventName: '28-40 years', venue: 'Soultrap Bar', startsAt: event,
      checkInUrl: 'https://x/checkin', timeZone: timeZoneForCity('Sydney'),
    });
    expect(html).toContain('Tuesday 10 November');
    expect(html).toContain('7:30 pm');
  });

  it('the event-change SMS is written in the zone it is given, defaulting to Sydney', () => {
    const c = {
      eventName: 'x', themeName: 'y', ageMin: 28, ageMax: 40, oldVenue: 'Soultrap', newVenue: 'Soultrap',
      newVenueFull: 'Soultrap', oldStartsAt: event, newStartsAt: event, venueChanged: false, timeChanged: true, cancelled: false,
    };
    expect(eventChangeSms(c)).toContain('10/11/26 at 7.30pm');
    expect(eventChangeSms({ ...c, timeZone: 'Australia/Perth' })).toContain('10/11/26 at 4.30pm');
  });
});

describe('zoneNote — "(Perth time)" only when the clocks differ', () => {
  // 7:30pm in Perth, 10 Nov 2026 (Perth UTC+8; Sydney on daylight saving, UTC+11).
  const perthEvent = new Date('2026-11-10T11:30:00.000Z');

  it('a Sydney member reading about a Perth event is told it is Perth time', () => {
    const t = eventTimeFor(perthEvent, 'Perth', 'Sydney');
    expect(formatEventWhen(perthEvent, t.timeZone)).toBe('Tue 10 Nov 2026 at 7:30pm');
    expect(t.zoneNote).toBe('Perth time');
  });

  it('no note for a Perth member, or between cities whose clocks agree', () => {
    expect(eventTimeFor(perthEvent, 'Perth', 'Perth').zoneNote).toBeNull();
    expect(eventTimeFor(event, 'Sydney', 'Melbourne').zoneNote).toBeNull();
    expect(eventTimeFor(event, 'Sydney', 'Newcastle').zoneNote).toBeNull();
  });

  it('Brisbane only differs from Sydney while NSW is on daylight saving', () => {
    expect(eventTimeFor(event, 'Sydney', 'Brisbane').zoneNote).toBe('Sydney time'); // November
    expect(eventTimeFor(new Date('2026-07-10T09:30:00Z'), 'Sydney', 'Brisbane').zoneNote).toBeNull(); // July
  });
});

describe('cross-city messages carry the note', () => {
  const perthEvent = new Date('2026-11-10T11:30:00.000Z'); // 7:30pm Perth
  const perth = eventTimeFor(perthEvent, 'Perth', 'Sydney');

  it('booking confirmation: "7:30 pm (Perth time)"', () => {
    const { html } = bookingConfirmationEmail({
      memberName: 'Ann', eventName: '28-40 years', venue: 'Bar', startsAt: perthEvent, checkInUrl: 'https://x', ...perth,
    });
    expect(html).toContain('7:30 pm (Perth time)');
  });

  it('event-change SMS: the note once, after the first time', () => {
    const sms = eventChangeSms({
      eventName: 'x', themeName: 'y', ageMin: 28, ageMax: 40, oldVenue: 'Bar', newVenue: 'Bar', newVenueFull: 'Bar',
      oldStartsAt: perthEvent, newStartsAt: perthEvent, venueChanged: false, timeChanged: true, cancelled: false, ...perth,
    });
    expect(sms).toContain('on 10/11/26 at 7.30pm (Perth time) at Bar');
    expect(sms.match(/Perth time/g)).toHaveLength(1);
  });

  it('a same-city member gets no note', () => {
    const { html } = bookingConfirmationEmail({
      memberName: 'Ann', eventName: 'x', venue: 'Bar', startsAt: perthEvent, checkInUrl: 'https://x', ...eventTimeFor(perthEvent, 'Perth', 'Perth'),
    });
    expect(html).not.toContain('Perth time');
  });
});
