import { describe, it, expect } from 'vitest';
import { rewriteOldAddress, mentionsOldAddress, ADDRESS_COLUMNS } from '../siteAddress';
import { publicUpcomingWhere } from '../eventAvailability';

describe('rewriteOldAddress (the move to fastmatch.com.au)', () => {
  it('rewrites saved pictures and Book Now links, whatever their spelling', () => {
    expect(rewriteOldAddress('https://5minutedating.com.au/api/uploads/abc.jpg')).toBe('https://fastmatch.com.au/api/uploads/abc.jpg');
    expect(rewriteOldAddress('http://5minutedating.com.au/events/ev1')).toBe('https://fastmatch.com.au/events/ev1');
    expect(rewriteOldAddress('https://www.5minutedating.com.au/events')).toBe('https://fastmatch.com.au/events');
    expect(rewriteOldAddress('HTTPS://WWW.5MinuteDating.com.au/events?x=1#y')).toBe('https://fastmatch.com.au/events?x=1#y');
  });

  it('rewrites the address typed into text, with or without www.', () => {
    expect(rewriteOldAddress('Book now: 5minutedating.com.au/events')).toBe('Book now: fastmatch.com.au/events');
    expect(rewriteOldAddress('See www.5minutedating.com.au for more.')).toBe('See fastmatch.com.au for more.');
    expect(rewriteOldAddress('Visit https://5minutedating.com.au.')).toBe('Visit https://fastmatch.com.au.');
    expect(rewriteOldAddress('<a href="https://5minutedating.com.au/events">5minutedating.com.au</a>'))
      .toBe('<a href="https://fastmatch.com.au/events">fastmatch.com.au</a>');
    expect(rewriteOldAddress('Two: https://5minutedating.com.au/a and 5minutedating.com.au/b'))
      .toBe('Two: https://fastmatch.com.au/a and fastmatch.com.au/b');
  });

  it('leaves email addresses, longer host names and other sites alone', () => {
    for (const text of [
      'Email gil@5minutedating.com.au',
      'mg.5minutedating.com.au tracking',
      'https://not5minutedating.com.au/x',
      'https://5minutedating.com.au.evil.example/x',
      'www.5minutedating.com.au.evil.example',
      'https://fastmatch.com.au/events',
      'Nothing to see here',
      '',
    ]) {
      expect(rewriteOldAddress(text)).toBe(text);
    }
  });

  it('is safe to run twice: a rewritten text has nothing left to change', () => {
    const once = rewriteOldAddress('https://5minutedating.com.au/api/uploads/a.jpg and www.5minutedating.com.au');
    expect(rewriteOldAddress(once)).toBe(once);
    expect(mentionsOldAddress(once)).toBe(false);
    expect(mentionsOldAddress('https://5minutedating.com.au/x')).toBe(true);
    expect(mentionsOldAddress(null)).toBe(false);
  });

  it('only ever names plain table and column names', () => {
    for (const { table, columns } of ADDRESS_COLUMNS) {
      expect(table).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
      for (const c of columns) expect(c).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
    }
  });
});

describe('publicUpcomingWhere (events list and sitemap)', () => {
  it('lists only public, upcoming, finished-drafting events that have not started', () => {
    const now = new Date('2026-11-12T00:00:00Z');
    expect(publicUpcomingWhere(now)).toEqual({ visibility: 'PUBLIC', status: 'UPCOMING', draft: false, startsAt: { gte: now } });
  });
});
