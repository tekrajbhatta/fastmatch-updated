import { describe, it, expect, vi, afterEach } from 'vitest';
import { validateFriends, parseDateOfBirth, AGE_BRACKET_MESSAGE, type FriendInput } from '@/lib/friendBooking';

// Frozen so "40 years old" means the same birthday every run.
afterEach(() => vi.useRealTimers());
const freeze = () => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-30T02:00:00Z')); };

const ctx = { ageMin: 35, ageMax: 49, memberEmail: 'me@example.com' };
const good: FriendInput = { gender: 'MALE', name: 'Henry', mobile: '0412345678', email: 'henry@example.com', dateOfBirth: '1986-05-20' }; // 40

describe('validateFriends', () => {
  it('accepts a complete friend inside the age bracket', () => {
    freeze();
    expect(validateFriends([good], ctx)).toEqual([]);
  });

  it("works the age out from the date of birth, using the old site's wording when outside the bracket", () => {
    freeze();
    // The case in Gil's screenshot: a 30-year-old friend for a 35-49 event.
    expect(validateFriends([{ ...good, dateOfBirth: '1996-01-01' }], ctx)).toEqual([{ index: 0, field: 'dateOfBirth', message: AGE_BRACKET_MESSAGE }]);
    expect(validateFriends([{ ...good, dateOfBirth: '1976-01-01' }], ctx)[0]?.field).toBe('dateOfBirth'); // 50
  });

  it('is exact on birthdays — 35 tomorrow is still too young today', () => {
    freeze();
    expect(validateFriends([{ ...good, dateOfBirth: '1991-10-01' }], ctx)[0]?.message).toBe(AGE_BRACKET_MESSAGE); // 34
    expect(validateFriends([{ ...good, dateOfBirth: '1991-09-29' }], ctx)).toEqual([]); // 35
  });

  it('never lets an under-18 through, even if the event range were set too low', () => {
    freeze();
    expect(validateFriends([{ ...good, dateOfBirth: '2010-01-01' }], { ...ctx, ageMin: 16 })[0]?.message).toBe(AGE_BRACKET_MESSAGE);
  });

  it('requires every field', () => {
    const errs = validateFriends([{ gender: 'FEMALE', name: ' ', mobile: '', email: '', dateOfBirth: '' }], ctx);
    expect(errs.map((e) => e.field).sort()).toEqual(['dateOfBirth', 'email', 'mobile', 'name']);
  });

  it('rejects a bad email, the member’s own email, and the same email twice', () => {
    freeze();
    expect(validateFriends([{ ...good, email: 'not-an-email' }], ctx)[0]?.field).toBe('email');
    expect(validateFriends([{ ...good, email: 'ME@example.com' }], ctx)[0]?.message).toMatch(/own email/);
    const dup = validateFriends([good, { ...good, name: 'Other', email: 'HENRY@example.com' }], ctx);
    expect(dup).toEqual([{ index: 1, field: 'email', message: 'Same email as friend 1' }]);
  });
});

describe('parseDateOfBirth', () => {
  it('accepts a real past date', () => {
    freeze();
    expect(parseDateOfBirth('1986-05-20')?.toISOString()).toBe('1986-05-20T00:00:00.000Z');
  });

  it('rejects impossible, future, malformed and ancient dates', () => {
    freeze();
    for (const bad of ['1986-02-31', '2030-01-01', '20/05/1986', '1986-5-20', '1850-01-01', 'abc']) {
      expect(parseDateOfBirth(bad), bad).toBeNull();
    }
  });
});
