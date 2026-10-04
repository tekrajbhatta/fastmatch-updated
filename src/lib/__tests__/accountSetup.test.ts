import { describe, it, expect } from 'vitest';
import { unfinishedSteps, bookingRefusal, setupStepLink, finishSetupHref, isAdminPath } from '@/lib/accountSetup';

/**
 * What a member still has to do before booking — one list for the event
 * page's notice, the booking refusal, My Account and "Finish setting up".
 */
const done = { emailVerified: true, mobileVerified: true, agreedTerms: true };

describe('unfinishedSteps', () => {
  it('is empty for a finished account', () => {
    expect(unfinishedSteps(done)).toEqual([]);
  });

  it('lists each thing still to do, in order', () => {
    expect(unfinishedSteps({ emailVerified: false, mobileVerified: false, agreedTerms: false })).toEqual(['email', 'mobile', 'terms']);
    expect(unfinishedSteps({ ...done, mobileVerified: false })).toEqual(['mobile']);
    // An imported member: confirmed, but never asked to accept this site's terms.
    expect(unfinishedSteps({ ...done, agreedTerms: false })).toEqual(['terms']);
  });
});

describe('bookingRefusal', () => {
  it('says exactly what is missing', () => {
    expect(bookingRefusal(['mobile'])).toBe('Please confirm your mobile number before booking.');
    expect(bookingRefusal(['email', 'mobile'])).toBe('Please confirm your email address and mobile number before booking.');
    expect(bookingRefusal(['terms'])).toBe('Please accept the Terms & Conditions and Privacy Policy before booking.');
    expect(bookingRefusal(['email', 'terms'])).toBe(
      'Please confirm your email address and accept the Terms & Conditions and Privacy Policy before booking.',
    );
  });
});

describe('setupStepLink', () => {
  const next = '/events/abc?code=SAVE10';

  it('sends the mobile step to the code page and the others to Finish setting up, coming back to the event', () => {
    expect(setupStepLink('mobile', next).href).toBe('/verify-mobile?next=%2Fevents%2Fabc%3Fcode%3DSAVE10');
    expect(setupStepLink('email', next).href).toBe(finishSetupHref(next));
    expect(setupStepLink('terms', next)).toMatchObject({ label: 'Accept the terms', href: '/account/finish?next=%2Fevents%2Fabc%3Fcode%3DSAVE10' });
  });
});

describe('isAdminPath', () => {
  it('matches the admin area and nothing that merely starts with the word', () => {
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/admin/events/1')).toBe(true);
    expect(isAdminPath('/admin?tab=x')).toBe(true);
    expect(isAdminPath('/administrator')).toBe(false);
    expect(isAdminPath('/events')).toBe(false);
  });
});
