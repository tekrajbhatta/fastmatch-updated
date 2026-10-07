import { describe, it, expect } from 'vitest';
import { mobileSearchDigits } from '@/lib/memberSearch';
import { discountStatus } from '@/lib/discountDates';
import { welcomeVerificationEmail } from '@/lib/emails/welcomeEmail';
import { emailChangedNoticeEmail } from '@/lib/emails/emailChangeEmails';

/** Batch 13: the second half of the review's "B" list (7 Oct). */

describe('searching members by mobile, however it was typed (item 20)', () => {
  it('a phone-number search becomes its digits, without a leading 0 or 61', () => {
    for (const s of ['0412345678', '0412 345 678', '+61 412 345 678', '61412345678', '0412-345-678']) {
      expect(mobileSearchDigits(s), s).toBe('412345678');
    }
    expect(mobileSearchDigits('345 678')).toBe('345678');
  });

  it('anything else is left to the name and email search', () => {
    expect(mobileSearchDigits('Olivia')).toBeNull();
    expect(mobileSearchDigits('olivia@example.com')).toBeNull();
    expect(mobileSearchDigits('041')).toBeNull(); // too few digits to mean anything
    expect(mobileSearchDigits(undefined)).toBeNull();
  });
});

describe('a discount code\'s status (item 30)', () => {
  const now = new Date('2026-10-07T00:00:00Z');
  it('"Active" only between its first and last day', () => {
    expect(discountStatus({ validFrom: '2026-10-10T00:00:00Z', validTo: '2026-12-01T00:00:00Z' }, now)).toBe('not-started');
    expect(discountStatus({ validFrom: '2026-10-01T00:00:00Z', validTo: '2026-12-01T00:00:00Z' }, now)).toBe('active');
    expect(discountStatus({ validFrom: '2026-09-01T00:00:00Z', validTo: '2026-10-01T00:00:00Z' }, now)).toBe('expired');
  });
});

describe('the welcome email for a member the admin added (item 42)', () => {
  it('with the mobile still to confirm, it says there are two steps', () => {
    const { html } = welcomeVerificationEmail({ memberName: 'Ann', verifyUrl: 'https://x.test/v', mobileToo: true });
    expect(html).toContain('You\'re two steps away');
    expect(html).toContain('2. Confirm your mobile: log in, and enter the 6-digit code we\'ve texted you');
    expect(html).toContain('Once both are done, you can browse and book events straight away.');
  });
  it('with only the email to confirm, it\'s one step, as before', () => {
    const { html } = welcomeVerificationEmail({ memberName: 'Ann', verifyUrl: 'https://x.test/v' });
    expect(html).toContain('You\'re one step away');
    expect(html).not.toContain('6-digit code');
    expect(html).toContain('Once confirmed, you can browse');
  });
});

describe('the old address is told when the email changes (item 44)', () => {
  it('names the new address, and how to get help', () => {
    const { subject, html } = emailChangedNoticeEmail({ name: 'Ann <A>', newEmail: 'ann@new.example' });
    expect(subject).toBe('Your FastMatch email address has been changed');
    expect(html).toContain('Hi Ann &lt;A&gt;');
    expect(html).toContain('<strong>ann@new.example</strong>');
    expect(html).toContain('If you didn\'t make this change, please contact');
  });
});

describe('a women-only or men-only night (Gil, 7 Oct)', () => {
  it('says who it\'s for, and isn\'t "sold out" for the other gender', async () => {
    const { toPublicEvent, onlyFor } = await import('@/lib/publicEvent');
    expect(onlyFor({ maxMen: 0, maxWomen: 12 })).toBe('WOMEN');
    expect(onlyFor({ maxMen: 12, maxWomen: 0 })).toBe('MEN');
    expect(onlyFor({ maxMen: 12, maxWomen: 12 })).toBeNull();
    const e: any = {
      id: 'e1', name: 'Ladies night', description: null, photoUrl: null, startsAt: new Date(), ageMin: 18, ageMax: 99, cost: 49,
      fastmatchDiscounts: true, groupDiscounts: true, themeId: 't', cityId: 'c', theme: { id: 't', name: 'T' }, city: { id: 'c', name: 'Sydney' },
      venue: { id: 'v', name: 'V', address: null, logoUrl: null }, maxMen: 0, maxWomen: 12, status: 'UPCOMING', visibility: 'PUBLIC', draft: false,
    };
    const forHim = toPublicEvent(e, { men: 0, women: 3 }, 'MALE');
    expect(forHim.onlyFor).toBe('WOMEN');
    expect(forHim.fullForYou).toBe(false);
    expect(toPublicEvent(e, { men: 0, women: 12 }, 'FEMALE').fullForYou).toBe(true);
  });

  it('an admin adding a man is told it\'s for women only', async () => {
    const { capacityProblem } = await import('@/lib/capacity');
    expect(capacityProblem({ men: 0, women: 2 }, { maxMen: 0, maxWomen: 12 }, { men: 1, women: 0 })).toBe('this event is for women only');
    expect(capacityProblem({ men: 0, women: 2 }, { maxMen: 0, maxWomen: 12 }, { men: 0, women: 1 })).toBeNull();
  });
});
