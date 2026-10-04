import { describe, it, expect } from 'vitest';
import { newSignupToken, hashSignupToken, signupNext } from '@/lib/pendingSignup';
import { finishSignupEmail, alreadyMemberEmail, finishInvitationEmail } from '@/lib/emails/signupEmails';

describe('sign-up link tokens', () => {
  it('are random, URL-safe, and stored only as a hash', () => {
    const a = newSignupToken();
    const b = newSignupToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.tokenHash).toBe(hashSignupToken(a.token));
    expect(a.tokenHash).not.toContain(a.token);
  });
});

describe('sign-up emails', () => {
  it('a new address gets the link that finishes signing up', () => {
    const { subject, html } = finishSignupEmail({ name: 'Olivia', finishUrl: 'https://fm.test/complete-signup?token=abc' });
    expect(subject).toBe('Confirm your email to finish joining FastMatch');
    expect(html).toContain('href="https://fm.test/complete-signup?token=abc"');
    expect(html).toContain("If you didn't sign up to FastMatch, just ignore this email");
  });

  it('a member is told they already have an account, with log-in and reset links', () => {
    const { subject, html } = alreadyMemberEmail({ name: 'Olivia', loginUrl: 'https://fm.test/login', resetUrl: 'https://fm.test/forgot-password' });
    expect(subject).toBe('You already have a FastMatch account');
    expect(html).toContain('href="https://fm.test/login"');
    expect(html).toContain('href="https://fm.test/forgot-password"');
  });

  it('someone a friend added gets a set-password link', () => {
    const { html } = finishInvitationEmail({ name: 'Olivia', setPasswordUrl: 'https://fm.test/set-password?token=xyz' });
    expect(html).toContain('href="https://fm.test/set-password?token=xyz"');
  });

  it('never puts a typed name into the email as markup', () => {
    const evil = '<a href="https://evil.test">Click</a>';
    for (const { html } of [
      finishSignupEmail({ name: evil, finishUrl: 'u' }),
      alreadyMemberEmail({ name: evil, loginUrl: 'u', resetUrl: 'u' }),
      finishInvitationEmail({ name: evil, setPasswordUrl: 'u' }),
    ]) {
      expect(html).not.toContain('<a href="https://evil.test">');
      expect(html).toContain('&lt;a href=&quot;https://evil.test&quot;&gt;');
    }
  });
});

describe('coming back after signing up', () => {
  it('keeps a page on this site to return to, and nothing else', () => {
    expect(signupNext('/events/abc?code=SAVE10')).toBe('/events/abc?code=SAVE10');
    expect(signupNext('https://evil.test/x')).toBeUndefined();
    expect(signupNext('//evil.test')).toBeUndefined();
    expect(signupNext('/\\evil.test')).toBeUndefined();
    expect(signupNext(42)).toBeUndefined();
    expect(signupNext('/' + 'a'.repeat(600))).toBeUndefined();
  });
});

describe('the set-password email says why it came', () => {
  it('after a password reset or a login attempt, as well as a sign-up', () => {
    const url = 'https://fm.test/set-password?token=xyz';
    expect(finishInvitationEmail({ name: 'Olivia', setPasswordUrl: url }).html).toContain('just tried to sign up');
    expect(finishInvitationEmail({ name: 'Olivia', setPasswordUrl: url, reason: 'reset' }).html).toContain('asked to reset the password');
    const login = finishInvitationEmail({ name: 'Olivia', setPasswordUrl: url, reason: 'login' });
    expect(login.html).toContain('just tried to log in');
    expect(login.html).toContain(`href="${url}"`);
    expect(login.subject).toBe('Finish setting up your FastMatch account');
  });
});

