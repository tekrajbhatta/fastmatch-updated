import { describe, it, expect, vi } from 'vitest';

vi.mock('../prisma', () => ({ prisma: {} }));

import { franchiseLockedReason, agreementDates, agreementsOverlap, franchiseInputSchema } from '@/lib/franchise';
import { canSeeCity, ownsCities, reportDates, scopeReportFilters, inAgreement, type Staff } from '@/lib/staff';
import { discountAppliesTo } from '@/lib/discountScope';
import { adMakerHref, adWhen } from '@/lib/adMaker';
import { eventChangeSms, bookingConfirmationEmail, eventChangeEmail } from '@/lib/emails/eventEmails';
import { friendWelcomeEmail } from '@/lib/emails/friendEmail';
import { contactLink } from '@/lib/contactEmail';
import { franchiseCancelSms } from '@/lib/franchiseAlerts';
import { friendCantComeReason } from '@/lib/memberBooking';
import { timeZoneForCity } from '@/lib/timezone';

/**
 * Franchises (Gil, Nov; his answers 15 Nov): franchisees log in to the admin
 * for their own locations only, between their agreement's dates.
 */

const dates = agreementDates({ agreementFrom: '2026-12-01', agreementTill: '2027-11-30' });
if (!dates.ok) throw new Error('dates');
const franchisee = { isFranchisee: true, franchiseFrom: dates.franchiseFrom, franchiseTill: dates.franchiseTill };

describe('the agreement', () => {
  it('runs from 12:00 am on the first day to 11:59:59 pm on the last, Sydney time', () => {
    expect(dates.franchiseFrom.toISOString()).toBe('2026-11-30T13:00:00.000Z'); // midnight, daylight saving
    expect(dates.franchiseTill.toISOString()).toBe('2027-11-30T12:59:59.999Z');
  });

  it('refuses dates the wrong way round, or missing', () => {
    expect(agreementDates({ agreementFrom: '2027-01-02', agreementTill: '2027-01-01' })).toEqual({ ok: false, error: '"Till" can’t be before "From".' });
    expect(agreementDates({ agreementFrom: '', agreementTill: '2027-01-01' }).ok).toBe(false);
  });

  it('lets them log in only between its dates (no login outside them, Gil’s answer 7)', () => {
    expect(franchiseLockedReason(franchisee, new Date('2026-11-30T12:59:00Z'))).toMatch(/starts on 0?1\/12\/2026/);
    expect(franchiseLockedReason(franchisee, new Date('2026-11-30T13:00:00Z'))).toBeNull();
    expect(franchiseLockedReason(franchisee, new Date('2027-11-30T12:59:00Z'))).toBeNull();
    expect(franchiseLockedReason(franchisee, new Date('2027-11-30T13:00:00Z'))).toMatch(/ended on 30\/11\/2027/);
    expect(franchiseLockedReason({ ...franchisee, franchiseTill: null })).toMatch(/isn’t set up/);
  });

  it('never locks out anyone who isn’t a franchisee', () => {
    expect(franchiseLockedReason({ isFranchisee: false, franchiseFrom: null, franchiseTill: null })).toBeNull();
  });

  it('a location has one franchisee at a time: agreements sharing a day overlap', () => {
    const a = { from: new Date('2027-01-01'), till: new Date('2027-06-30') };
    expect(agreementsOverlap(a, { from: new Date('2027-06-30'), till: new Date('2027-12-31') })).toBe(true);
    expect(agreementsOverlap(a, { from: new Date('2027-07-01'), till: new Date('2027-12-31') })).toBe(false);
    expect(agreementsOverlap(a, { from: new Date('2026-01-01'), till: new Date('2026-12-31') })).toBe(false);
  });
});

describe('the Franchises form', () => {
  const base = { name: 'Jane Citizen', email: 'jane@example.com', mobile: '0412 345 678', cityIds: ['mel'], password: 'secret123', agreementFrom: '2026-12-01', agreementTill: '2027-11-30' };

  it("takes Gil's fields: name, email, mobile, locations, password and the dates", () => {
    expect(franchiseInputSchema.parse(base)).toMatchObject({ name: 'Jane Citizen', cityIds: ['mel'], password: 'secret123' });
  });

  it('needs at least one location, an Australian mobile, and a password of 8 or more when one is typed', () => {
    expect(franchiseInputSchema.safeParse({ ...base, cityIds: [] }).success).toBe(false);
    expect(franchiseInputSchema.safeParse({ ...base, mobile: '+1 555 0100' }).success).toBe(false);
    expect(franchiseInputSchema.safeParse({ ...base, password: 'short' }).success).toBe(false);
    // Left empty when changing a franchisee: they keep theirs.
    expect(franchiseInputSchema.parse({ ...base, password: '' }).password).toBeUndefined();
  });
});

describe('what a franchisee may see', () => {
  const gil: Staff = { member: {} as Staff['member'], isAdmin: true, cityIds: null, agreement: null };
  const jane: Staff = { member: {} as Staff['member'], isAdmin: false, cityIds: ['mel', 'gee'], agreement: { from: dates.franchiseFrom, till: dates.franchiseTill } };

  it('their own locations only; Gil sees everywhere', () => {
    expect(canSeeCity(jane, 'mel')).toBe(true);
    expect(canSeeCity(jane, 'syd')).toBe(false);
    expect(canSeeCity(jane, null)).toBe(false);
    expect(canSeeCity(gil, 'syd')).toBe(true);
    expect(ownsCities(jane, ['mel', 'gee'])).toBe(true);
    expect(ownsCities(jane, ['mel', 'syd'])).toBe(false);
    // None means every location: Gil's alone.
    expect(ownsCities(jane, [])).toBe(false);
    expect(ownsCities(gil, [])).toBe(true);
  });

  it('their reports cover only their locations and their agreement’s dates (Gil’s answer 7)', () => {
    expect(reportDates(jane, {})).toEqual({ dateFrom: '2026-12-01', dateTo: '2027-11-30' });
    expect(reportDates(jane, { dateFrom: '2027-03-01', dateTo: '2028-03-01' })).toEqual({ dateFrom: '2027-03-01', dateTo: '2027-11-30' });
    expect(reportDates(jane, { dateFrom: '2025-01-01', dateTo: '2027-02-28' })).toEqual({ dateFrom: '2026-12-01', dateTo: '2027-02-28' });
    expect(scopeReportFilters(jane, { cityId: 'gee' }).cityIds).toEqual(['mel', 'gee']);
    // Another city: nothing to report.
    expect(scopeReportFilters(jane, { cityId: 'syd' }).cityIds).toEqual([]);
    expect(scopeReportFilters(gil, { dateFrom: '2020-01-01' })).toEqual({ q: { dateFrom: '2020-01-01' }, cityIds: null });
    expect(inAgreement(jane, new Date('2027-05-01'))).toBe(true);
    expect(inAgreement(jane, new Date('2028-05-01'))).toBe(false);
    expect(inAgreement(gil, new Date('2010-05-01'))).toBe(true);
  });
});

describe('discount code locations', () => {
  const code = { validFrom: new Date('2026-01-01'), validTo: new Date('2027-12-31'), scopeThemeId: null, scopeEventId: null };
  const now = new Date('2026-12-15');
  const melbourne = { id: 'e1', themeId: 't1', cityId: 'mel' };

  it("Gil's codes (no locations) work everywhere, franchise events included (Gil's answer 6)", () => {
    expect(discountAppliesTo({ ...code, scopeCities: [] }, melbourne, now)).toBe(true);
    expect(discountAppliesTo(code, melbourne, now)).toBe(true);
  });

  it("a franchisee's codes only work in their locations", () => {
    expect(discountAppliesTo({ ...code, scopeCities: [{ id: 'mel' }, { id: 'gee' }] }, melbourne, now)).toBe(true);
    expect(discountAppliesTo({ ...code, scopeCities: [{ id: 'gee' }] }, melbourne, now)).toBe(false);
  });
});

describe('member emails about a franchisee’s event (Gil’s answer 11)', () => {
  const when = new Date('2026-12-02T08:30:00.000Z');

  it('give the franchisee’s address to write to; Gil’s otherwise', () => {
    const base = { memberName: 'Sam', eventName: 'Speed dating, 28-40 years', venue: 'Bar', startsAt: when, checkInUrl: null, timeZone: 'Australia/Melbourne' };
    expect(bookingConfirmationEmail({ ...base, contactEmail: 'jane@melbourne.example' }).html).toContain('mailto:jane@melbourne.example');
    expect(bookingConfirmationEmail({ ...base, contactEmail: 'jane@melbourne.example' }).html).not.toContain('mailto:gil@fastmatch.com.au">gil');
    expect(bookingConfirmationEmail(base).html).toContain('mailto:gil@fastmatch.com.au');
    const friend = friendWelcomeEmail({ friendName: 'Al', bookedByName: 'Sam', eventName: 'x', venue: 'Bar', startsAt: when, timeZone: 'Australia/Melbourne', setPasswordUrl: 'https://x', checkInUrl: null, contactEmail: 'jane@melbourne.example' });
    expect(friend.html).toContain('mailto:jane@melbourne.example');
  });

  it('the change and cancellation messages too', () => {
    const change = {
      eventName: 'x', themeName: 'Speed dating', ageMin: 28, ageMax: 40, oldVenue: 'Bar', newVenue: 'Bar', newVenueFull: 'Bar, 1 St',
      oldStartsAt: when, newStartsAt: when, venueChanged: false, timeChanged: false, cancelled: true, timeZone: 'Australia/Melbourne',
      contactEmail: 'jane@melbourne.example',
    };
    expect(eventChangeSms(change)).toMatch(/jane@melbourne\.example$/);
    expect(eventChangeEmail({ ...change, memberName: 'Sam' }).html).toContain('mailto:jane@melbourne.example');
    expect(eventChangeSms({ ...change, contactEmail: undefined })).toMatch(/gil@fastmatch\.com\.au$/);
  });

  it('the address is escaped', () => {
    expect(contactLink('a"b@x.com')).toBe('<a href="mailto:a&quot;b@x.com">a&quot;b@x.com</a>');
    expect(contactLink(null)).toContain('gil@fastmatch.com.au');
  });
});

describe('Gil is told when a franchisee cancels (Gil’s answer 5)', () => {
  it('by a text saying who, which event, and any refunds left for him', () => {
    expect(franchiseCancelSms({ franchiseeName: 'Jane', label: '#12 Speed dating, 28-40 years', city: 'Melbourne', when: '02/12/26 at 7.30pm', booked: 9, byHand: 2 }))
      .toBe('FastMatch: Jane cancelled #12 Speed dating, 28-40 years, Melbourne, 02/12/26 at 7.30pm. 9 booked were told. 2 to refund by hand.');
    expect(franchiseCancelSms({ franchiseeName: 'Jane', label: '#12 x', city: 'Melbourne', when: 'w', booked: 0, byHand: 0 })).not.toMatch(/refund/);
  });
});

describe('a franchise login is never booked', () => {
  it('not even as a friend on someone’s booking', () => {
    const account = { gender: 'FEMALE', dateOfBirth: new Date('1990-01-01'), isFranchisee: true };
    expect(friendCantComeReason(account, null, { gender: 'FEMALE' }, { ageMin: 18, ageMax: 99 })).toMatch(/franchisee’s login/);
  });
});

describe('the Ad Maker, filled in from an event', () => {
  const event = {
    startsAt: '2026-11-18T08:30:00.000Z', ageMin: 35, ageMax: 49, maxMen: 12, maxWomen: 12, ratingAudience: 'OPPOSITE_GENDER',
    theme: { name: 'Professionals speed dating' }, venue: { name: 'Soultrap Bar' }, city: { name: 'Sydney' },
  };

  it("writes the date as the Ad Maker's own example does, on the event city's clock", () => {
    expect(adWhen(event.startsAt, 'Sydney')).toBe('Wed 18 Nov, 7:30pm');
    expect(adWhen(event.startsAt, 'Perth')).toBe('Wed 18 Nov, 4:30pm');
  });

  it('sends every line, so nothing carries over from the last ad made', () => {
    const href = adMakerHref(event);
    expect(href.startsWith('/admin/ad-maker?')).toBe(true);
    const q = new URLSearchParams(href.split('?')[1]);
    expect(q.get('head')).toBe('Professionals speed dating');
    expect(q.get('venue')).toBe('Ages 35–49 · Soultrap Bar\nWed 18 Nov, 7:30pm');
    expect(q.get('sub')).toBe('Meet up to 12 singles, 5 minutes each.');
    expect(q.get('code')).toBe('');
    expect(q.get('book')).toBe('Book now at fastmatch.com.au');
    expect(q.get('img')).toBe('3');
  });

  it('says nothing about dates for an event with no matches (a day at the races)', () => {
    expect(new URLSearchParams(adMakerHref({ ...event, ratingAudience: 'NO_MATCHES' }).split('?')[1]).get('sub')).toBe('');
  });
});

describe('the new locations', () => {
  it("each has its own state's clock", () => {
    expect(timeZoneForCity('Hobart')).toBe('Australia/Hobart');
    expect(timeZoneForCity('Canberra')).toBe('Australia/Sydney');
    expect(timeZoneForCity('North Coast (NSW)')).toBe('Australia/Sydney');
    expect(timeZoneForCity('Geelong')).toBe('Australia/Melbourne');
    expect(timeZoneForCity('Fremantle')).toBe('Australia/Perth');
    for (const qld of ['Sunshine Coast', 'Townsville', 'Cairns', 'Rockhampton']) expect(timeZoneForCity(qld), qld).toBe('Australia/Brisbane');
  });
});
