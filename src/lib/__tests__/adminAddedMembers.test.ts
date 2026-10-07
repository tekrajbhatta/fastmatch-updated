import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { australianMobile, isAustralianMobile, sameMobile } from '@/lib/mobile';
import { newMemberSchema, newMemberData } from '@/lib/adminMember';
import { registeredByAdminEmail } from '@/lib/emails/signupEmails';
import { signPasswordResetToken, readPurposeToken, RESET_LINK_MINUTES } from '@/lib/tokens';
import { validateFriends } from '@/lib/friendBooking';

/**
 * Gil round 2, batch 3: members the admin adds (terms accepted for them, a
 * password they can keep or replace, the "You've been registered" email) and
 * Australian mobiles only (Q21).
 */
beforeAll(() => { process.env.JWT_SECRET = 'test-secret-for-batch3'; });
afterEach(() => vi.useRealTimers());

describe('Australian mobiles only (Q21)', () => {
  it('accepts an Australian mobile however it is written', () => {
    for (const m of ['0412 345 678', '0412345678', '0412-345-678', '+61 412 345 678', '+61412345678', '61412345678', '412 345 678', ' (0412) 345 678 ']) {
      expect(isAustralianMobile(m)).toBe(true);
      expect(australianMobile(m)).toBe('61412345678');
    }
  });

  it('refuses landlines, overseas numbers and anything else', () => {
    for (const m of ['02 9555 1234', '+44 7911 123456', '+1 415 555 0101', '041234567', '04123456789', 'call me', '', '+61 (0) 412 345 678']) {
      expect(isAustralianMobile(m)).toBe(false);
    }
  });

  it('knows the same number written two ways is the same number', () => {
    expect(sameMobile('0412 345 678', '+61412345678')).toBe(true);
    expect(sameMobile('0412345678', '0412345679')).toBe(false);
    // An old overseas number already saved, re-saved unchanged: not a "new" number.
    expect(sameMobile('+44 7911 123456', '+447911123456')).toBe(true);
  });

  it('applies to the friends a member books in', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-30T02:00:00Z'));
    const friend = { gender: 'MALE' as const, name: 'Henry', mobile: '+44 7911 123456', email: 'henry@example.com', dateOfBirth: '1986-05-20' };
    expect(validateFriends([friend], { ageMin: 35, ageMax: 49, memberEmail: 'me@example.com' })).toEqual([
      { index: 0, field: 'mobile', message: 'Please enter an Australian mobile, like 0412 345 678' },
    ]);
  });
});

describe('a member the admin adds', () => {
  const input = {
    password: 'Given-by-Gil-1', name: 'Walk In', gender: 'FEMALE', email: 'walkin@example.test', dateOfBirth: '1990-04-04',
    mobile: '0412 345 678', cityId: 'c1', confirmation: 'CONFIRMED', contactMethod: 'EMAIL_AND_SMS', marketingOptIn: false,
  };

  it('needs an Australian mobile', () => {
    expect(newMemberSchema.safeParse(input).success).toBe(true);
    const bad = newMemberSchema.safeParse({ ...input, mobile: '+1 415 555 0101' });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0].message).toBe('Please enter an Australian mobile number, like 0412 345 678.');
  });

  it('has the terms accepted for them (Gil, item 10) and the admin\'s password marked as such', () => {
    const parsed = newMemberSchema.parse(input);
    const row = newMemberData(parsed, 'hash', new Date('1990-04-04'));
    expect(row.agreedTerms).toBe(true);
    expect(row.agreedTermsAt).toBeInstanceOf(Date);
    expect(row.passwordSetByAdmin).toBe(true);
    expect([row.emailVerified, row.mobileVerified]).toEqual([true, true]);
    const unconfirmed = newMemberData(newMemberSchema.parse({ ...input, confirmation: 'UNCONFIRMED' }), 'hash', new Date('1990-04-04'));
    expect([unconfirmed.emailVerified, unconfirmed.mobileVerified]).toEqual([false, false]);
  });
});

describe('"You\'ve been registered with FastMatch"', () => {
  it('says to log in with the password they were given, never includes it, and links to choosing their own', () => {
    const { subject, html } = registeredByAdminEmail({
      name: 'Walk <In>', loginUrl: 'https://fastmatch.test/login', choosePasswordUrl: 'https://fastmatch.test/reset-password?token=abc',
    });
    expect(subject).toBe("You've been registered with FastMatch");
    expect(html).toContain('the password FastMatch gave you');
    expect(html).toContain('href="https://fastmatch.test/login"');
    expect(html).toContain('href="https://fastmatch.test/reset-password?token=abc"');
    expect(html).toContain('This link works for 7 days');
    expect(html).toContain('Walk &lt;In&gt;');
    expect(html).not.toContain('Given-by-Gil');
  });

  it('its choose-your-own-password link lasts a week (a normal reset link, 30 minutes) and still works as a reset link', () => {
    const member = { id: 'm1', email: 'walk@example.test', passwordHash: '$2a$12$abcdefghijklmnopqrstuv' };
    const week = signPasswordResetToken(member, 7 * 24 * 60);
    const normal = signPasswordResetToken(member);
    const life = (t: string) => { const p = jwt.decode(t) as { iat: number; exp: number }; return (p.exp - p.iat) / 60; };
    expect(life(week)).toBe(7 * 24 * 60);
    expect(life(normal)).toBe(RESET_LINK_MINUTES);
    expect(readPurposeToken(week, 'password_reset')).toMatchObject({ ok: true, memberId: 'm1' });
  });
});
