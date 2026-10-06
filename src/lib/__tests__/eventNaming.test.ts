import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { eventLabel } from '@/lib/eventLabel';
import { eventTitle } from '@/lib/pageTitles';
import { orderForMember, splitBySuitability, type TableEvent } from '@/lib/memberEvents';
import { bookingConfirmationEmail } from '@/lib/emails/eventEmails';
import { readPurposeToken } from '@/lib/tokens';
import { sendBookingConfirmation } from '@/lib/sendBookingConfirmation';

/**
 * Gil round 2, batch 4: events named by type and name in emails and on My
 * Match History (items 13, 14, 17, Q18), Upcoming Events in two tables by age
 * (item 16), and one email for a member added at an event (the user, 6 Oct).
 */
const h = vi.hoisted(() => ({
  sent: [] as { to: string; subject: string; html: string }[],
  booking: null as unknown,
}));
vi.mock('@/lib/emails/send', () => ({ sendEmail: async (m: { to: string; subject: string; html: string }) => { h.sent.push(m); } }));
vi.mock('@/lib/prisma', () => ({ prisma: { booking: { findUniqueOrThrow: async () => h.booking } } }));

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-for-gil2-batch4';
  process.env.APP_URL = 'https://fastmatch.test/';
});

describe('eventLabel: type, then the name as typed (Q18)', () => {
  const label = (name: string, type: string) => eventLabel({ name, theme: { name: type } });

  it('puts the type before a name that is just the age range', () => {
    expect(label('28-40 years', 'Speed dating')).toBe('Speed dating, 28-40 years');
    expect(label('Ages 25 to 45 years', 'Cocktail speed dating')).toBe('Cocktail speed dating, Ages 25 to 45 years');
    expect(label('  Ages 20-40, Sydney ', ' Speed dating ')).toBe('Speed dating, Ages 20-40, Sydney');
  });

  it('leaves the type out when the name already says it, however it is written', () => {
    expect(label('Professional Speed Dating, 28 to 40 years', 'Professional Speed Dating')).toBe('Professional Speed Dating, 28 to 40 years');
    // A plural "s", case, "and" for "&", punctuation, word order.
    expect(label('Professional Speed Dating, 28 to 40 years', 'Professionals speed dating')).toBe('Professional Speed Dating, 28 to 40 years');
    expect(label('Cooking Class and Speed Dating, 30-45', 'Cooking class & speed dating')).toBe('Cooking Class and Speed Dating, 30-45');
    expect(label('Speed dating for wine lovers, 30-45', 'Wine Lovers speed dating')).toBe('Speed dating for wine lovers, 30-45');
    expect(label('A day at the races, 28-40', 'A Day at the Races')).toBe('A day at the races, 28-40');
  });

  it('keeps the type when the name says only part of it', () => {
    expect(label('Speed dating, 25-39 years', 'Asian speed dating')).toBe('Asian speed dating, Speed dating, 25-39 years');
  });

  it('copes with a missing type or name', () => {
    expect(label('28-40 years', '')).toBe('28-40 years');
    expect(label('  ', 'Speed dating')).toBe('Speed dating');
  });

  it('browser-tab titles follow the same rule, then add the city', () => {
    expect(eventTitle({ name: 'Professional Speed Dating, 28 to 40 years', theme: { name: 'Professionals speed dating' }, city: { name: 'Perth' } }))
      .toBe('Professional Speed Dating, 28 to 40 years, Perth');
    expect(eventTitle({ name: '28-40 years', theme: { name: 'Speed Dating' }, city: { name: 'Sydney' } })).toBe('Speed Dating, 28-40 years, Sydney');
  });
});

describe('Upcoming Events in two tables (item 16)', () => {
  const ev = (id: string, day: number, ageMin: number, ageMax: number, o: Partial<TableEvent> = {}): TableEvent => ({
    id, startsAt: `2026-11-${String(day).padStart(2, '0')}T09:00:00Z`, ageMin, ageMax, cost: '49', bookedByMe: false, cityId: 'syd', ...o,
  });
  const events = [
    ev('fifties', 3, 50, 65),
    ev('young-later', 20, 18, 30),
    ev('booked-young', 25, 18, 35, { bookedByMe: true }),
    ev('thirties', 5, 30, 45),
    ev('young-soon', 4, 18, 25),
  ];

  it('an 18-year-old sees only the events for 18 first, then all the rest', () => {
    const { suitable, other } = splitBySuitability(orderForMember(events, 'syd'), 18);
    expect(suitable.map((e) => e.id)).toEqual(['booked-young', 'young-soon', 'young-later']);
    expect(other.map((e) => e.id)).toEqual(['fifties', 'thirties']);
  });

  it('includes the edges of the age range, and can leave either table empty', () => {
    expect(splitBySuitability(events, 30).suitable.map((e) => e.id)).toEqual(['young-later', 'booked-young', 'thirties']);
    expect(splitBySuitability(events, 70).suitable).toEqual([]);
    expect(splitBySuitability([ev('a', 1, 18, 99)], 40).other).toEqual([]);
  });
});

describe('booking confirmation names the event by type (item 13)', () => {
  const startsAt = new Date('2026-11-10T08:30:00.000Z');
  it('is in the sentence and the subject', () => {
    const { subject, html } = bookingConfirmationEmail({
      memberName: 'Ann', eventName: 'Cocktail speed dating, Ages 25 to 45 years', venue: 'Hangout Bar, 1 George St',
      startsAt, timeZone: 'Australia/Sydney', checkInUrl: 'https://fastmatch.test/events/e1/checkin',
    });
    expect(subject).toBe("You're booked: Cocktail speed dating, Ages 25 to 45 years");
    expect(html).toContain("You're confirmed for <strong>Cocktail speed dating, Ages 25 to 45 years</strong> at Hangout Bar, 1 George St.");
    expect(html).toContain("You're booked in!");
    expect(html).not.toContain('Your FastMatch account');
  });
});

describe('a member added at an event gets ONE email: booking + how to log in', () => {
  const member = { id: 'm1', name: 'Walk <In>', email: 'walk@example.test', passwordHash: '$2a$12$abcdefghijklmnopqrstuv', city: { name: 'Sydney' } };
  beforeEach(() => {
    h.sent.length = 0;
    h.booking = {
      id: 'b1', eventId: 'e1', member,
      event: {
        id: 'e1', name: 'Ages 25 to 45 years', startsAt: new Date('2026-11-10T08:30:00.000Z'),
        venue: { name: 'Hangout Bar', address: '1 George St' }, city: { name: 'Sydney' }, theme: { name: 'Cocktail speed dating' },
      },
    };
  });

  it('says they are registered and booked, with the log-in and choose-your-own-password links', async () => {
    await sendBookingConfirmation('b1', { registered: true });
    expect(h.sent).toHaveLength(1);
    const { to, subject, html } = h.sent[0];
    expect(to).toBe('walk@example.test');
    expect(subject).toBe("You're registered with FastMatch and booked: Cocktail speed dating, Ages 25 to 45 years");
    expect(html).toContain("You're registered and booked in!");
    expect(html).toContain('Hi Walk &lt;In&gt;,');
    expect(html).toContain('<strong>Cocktail speed dating, Ages 25 to 45 years</strong> at Hangout Bar, 1 George St.');
    expect(html).toContain('the password FastMatch gave you');
    expect(html).toContain('href="https://fastmatch.test/login"');
    expect(html).toContain('This link works for 7 days');
    // The account part comes before the check-in steps, which need a log-in.
    expect(html.indexOf('Your FastMatch account')).toBeGreaterThan(0);
    expect(html.indexOf('Your FastMatch account')).toBeLessThan(html.indexOf('How to check in on the night'));
    expect(html).toContain('href="https://fastmatch.test/events/e1/checkin"');

    // The choose-your-own-password link is a reset link for them, for a week.
    const token = html.match(/reset-password\?token=([^"]+)"/)?.[1] ?? '';
    expect(readPurposeToken(token, 'password_reset')).toMatchObject({ ok: true, memberId: 'm1' });
    const p = jwt.decode(token) as { iat: number; exp: number };
    expect(p.exp - p.iat).toBe(7 * 24 * 60 * 60);
  });

  it('anyone else gets the plain booking email, also naming the type', async () => {
    await sendBookingConfirmation('b1');
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].subject).toBe("You're booked: Cocktail speed dating, Ages 25 to 45 years");
    expect(h.sent[0].html).not.toContain('reset-password');
    expect(h.sent[0].html).not.toContain('Your FastMatch account');
  });
});
