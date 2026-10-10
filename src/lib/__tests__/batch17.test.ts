import { describe, it, expect } from 'vitest';
import { nameProblem, nameProblemSentence } from '@/lib/personName';
import { validateFriends } from '@/lib/friendBooking';
import { withEmailSpacing, emailLayout } from '@/lib/emails/layout';

describe('names (personName)', () => {
  it('lets real names through, in any alphabet, with initials, hyphens and apostrophes', () => {
    for (const n of ['Anna', "Mary-Jane O'Neil", 'J. R. Smith', 'Zoë Ândré', '李小龙', 'Dev Test2', '  Bob  ']) {
      expect(nameProblem(n)).toBeNull();
    }
  });
  it('leaves an empty name to each form', () => {
    expect(nameProblem('')).toBeNull();
    expect(nameProblem('   ')).toBeNull();
  });
  it('catches an email address or a web address typed into the name box', () => {
    expect(nameProblem('vewiyin696@herclan.comewiyin Herclan.com')).toBe('That looks like an email address. Please enter their name');
    expect(nameProblem('see https://example.com')).toBe('That looks like a web address. Please enter their name');
    expect(nameProblem('www.example.com', 'your')).toBe('That looks like a web address. Please enter your name');
  });
  it('wants at least one letter, and no more than 100 characters', () => {
    expect(nameProblem('12345')).toBe('Please enter their name using letters');
    expect(nameProblem('a'.repeat(101))).toBe('Please use a shorter name');
  });
  it('has a full-stop version for forms whose messages are sentences', () => {
    expect(nameProblemSentence('x@y.com', 'the member’s')).toBe('That looks like an email address. Please enter the member’s name.');
    expect(nameProblemSentence('Anna')).toBeNull();
  });
  it('is part of the friend checks on the event page and at booking', () => {
    const friend = { gender: 'MALE' as const, name: 'pal@example.com', mobile: '0412 345 678', email: 'pal@example.com', dateOfBirth: '1990-01-01' };
    const errors = validateFriends([friend], { ageMin: 18, ageMax: 99, memberEmail: 'me@example.com' });
    expect(errors).toContainEqual({ index: 0, field: 'name', message: 'That looks like an email address. Please enter their name' });
    expect(validateFriends([{ ...friend, name: 'Pal Smith' }], { ageMin: 18, ageMax: 99, memberEmail: 'me@example.com' })).toEqual([]);
  });
});

describe('email paragraph spacing', () => {
  it('gives bare paragraphs and lists their own spacing, and leaves styled ones alone', () => {
    expect(withEmailSpacing('<p>Hi</p><p style="color:red">x</p><ol><li>One</li></ol>'))
      .toBe('<p style="margin:0 0 16px;">Hi</p><p style="color:red">x</p><ol style="margin:0 0 16px;padding-left:22px;"><li style="margin:0 0 6px;">One</li></ol>');
  });
  it('is applied to every email that uses the layout', () => {
    expect(emailLayout('<p>Hello</p>')).toContain('<p style="margin:0 0 16px;">Hello</p>');
  });
});
