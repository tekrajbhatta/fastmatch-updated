import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { formatPrice } from '@/lib/price';
import { namesCity, venueLineWithCity, venueBlock } from '@/lib/venue';
import { eventTitle } from '@/lib/pageTitles';
import { attendedBooking } from '@/lib/attended';
import { verificationCodeSms } from '@/lib/sms/verificationSms';
import { smsLength } from '@/lib/sms/smsLength';
import { EMAIL_HEADING } from '@/lib/emails/layout';
import { sendEmail } from '@/lib/emails/send';

/** Batch 4d polish: prices, cities, tab titles, "attended", email headings, the code text, reply-to. */
describe('formatPrice', () => {
  it('shows whole dollars without cents and anything else with two', () => {
    expect(formatPrice(49)).toBe('$49');
    expect(formatPrice('49.5')).toBe('$49.50');
    expect(formatPrice('45.00')).toBe('$45');
    expect(formatPrice(0)).toBe('$0');
    expect(formatPrice(-10)).toBe('−$10');
    expect(formatPrice(1234.5)).toBe('$1,234.50');
    expect(formatPrice(0.1 + 0.2)).toBe('$0.30');
  });
});

describe('the city after an address', () => {
  const venue = { name: 'GG Bar', address: '88 Campbell St, Surry Hills' };
  it('is added when the address doesn’t already end with it', () => {
    expect(venueLineWithCity(venue, 'Sydney')).toBe('GG Bar, 88 Campbell St, Surry Hills, Sydney');
    expect(venueLineWithCity({ name: 'GG Bar' }, 'Perth')).toBe('GG Bar, Perth');
  });
  it('isn’t repeated, including before a state and postcode', () => {
    expect(venueLineWithCity({ name: 'GG Bar', address: '1 George St, Sydney' }, 'Sydney')).toBe('GG Bar, 1 George St, Sydney');
    expect(venueLineWithCity({ name: 'GG Bar', address: '1 George St, Sydney NSW 2000' }, 'Sydney')).toBe('GG Bar, 1 George St, Sydney NSW 2000');
    expect(namesCity('12 Sydney Rd, Brunswick', 'Melbourne')).toBe(false);
    expect(namesCity('12 Sydney Rd, Brunswick', 'Sydney')).toBe(false);
    expect(venueBlock({ name: 'GG Bar', address: '1 George St, Sydney NSW 2000' }, 'Sydney')).toBe('GG Bar\n1 George St, Sydney NSW 2000');
  });
});

describe('eventTitle', () => {
  it('names the event by type, name and city', () => {
    expect(eventTitle({ name: '28-40 years', theme: { name: 'Speed Dating' }, city: { name: 'Sydney' } })).toBe('Speed Dating, 28-40 years, Sydney');
  });
  it('doesn’t repeat a type or city the name already has', () => {
    expect(eventTitle({ name: 'Professional Speed Dating, 28 to 40 years', theme: { name: 'Professional Speed Dating' }, city: { name: 'Perth' } }))
      .toBe('Professional Speed Dating, 28 to 40 years, Perth');
    expect(eventTitle({ name: 'Ages 28–40, Sydney CBD', theme: { name: 'Speed Dating' }, city: { name: 'Sydney' } })).toBe('Speed Dating, Ages 28–40, Sydney CBD');
  });
});

describe('attendedBooking (Events attended)', () => {
  const now = new Date('2026-10-05T00:00:00Z');
  const past = { startsAt: '2026-10-01T09:00:00Z', status: 'SCHEDULED' };
  it('counts a paid booking at an event that has happened, however it was paid', () => {
    expect(attendedBooking({ status: 'CONFIRMED', event: past }, now)).toBe(true);
  });
  it('not an unpaid, cancelled or future one, or a cancelled event', () => {
    expect(attendedBooking({ status: 'PENDING', event: past }, now)).toBe(false);
    expect(attendedBooking({ status: 'CANCELLED', event: past }, now)).toBe(false);
    expect(attendedBooking({ status: 'CONFIRMED', event: { startsAt: '2026-10-09T09:00:00Z' } }, now)).toBe(false);
    expect(attendedBooking({ status: 'CONFIRMED', event: { ...past, status: 'CANCELLED' } }, now)).toBe(false);
  });
});

describe('the verification text', () => {
  it('points to the website (there’s no app) and fits one SMS', () => {
    const body = verificationCodeSms('123456');
    expect(body).toContain('Enter it on the FastMatch website');
    expect(body).not.toMatch(/app/i);
    expect(body.length).toBeLessThanOrEqual(160);
    expect(smsLength(body).unicode).toBe(false);
  });
});

describe('one heading style for every email', () => {
  it('every <h1> in an email uses EMAIL_HEADING', () => {
    const root = path.resolve(__dirname, '../..');
    const files = [
      ...fs.readdirSync(path.join(root, 'lib/emails')).map((f) => path.join(root, 'lib/emails', f)),
      path.join(root, 'app/api/contact-us/route.ts'),
    ].filter((f) => f.endsWith('.ts'));
    const headings = files.flatMap((f) => (fs.readFileSync(f, 'utf8').match(/<h1 style="[^"]*"/g) ?? []).map((h) => `${path.basename(f)}: ${h}`));
    expect(headings.length).toBeGreaterThan(15);
    expect(headings.filter((h) => !h.includes('<h1 style="${EMAIL_HEADING}'))).toEqual([]);
    expect(EMAIL_HEADING).toContain('font-size:20px');
  });
});

describe('sendEmail’s reply-to', () => {
  afterEach(() => vi.restoreAllMocks());
  it('is optional, and kept to one line', async () => {
    const saved = process.env.MAILGUN_SMTP_USER;
    delete process.env.MAILGUN_SMTP_USER;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await sendEmail({ to: 'gil@example.test', subject: 'Contact Us: Ann', html: '<p>x</p>', replyTo: 'ann@example.test\r\nBcc: evil@example.test' });
    await sendEmail({ to: 'gil@example.test', subject: 'No reply-to', html: '<p>x</p>' });
    expect(log.mock.calls[0][0]).toBe('[stub] Would email gil@example.test: "Contact Us: Ann" (reply-to ann@example.testBcc: evil@example.test)');
    expect(log.mock.calls[1][0]).toBe('[stub] Would email gil@example.test: "No reply-to"');
    if (saved !== undefined) process.env.MAILGUN_SMTP_USER = saved;
  });
});
