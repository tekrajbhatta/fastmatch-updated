import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-email-change';
});

/**
 * Changing the email on My Account: the new address only takes effect from a
 * link sent to it, and the member is told the same thing whether or not the
 * address is already someone else's.
 */
describe('email-change link', () => {
  it('carries the new address, the old one and the password fingerprint, and is not a login', async () => {
    const { signEmailChangeToken, readPurposeToken, readSessionToken, passwordFingerprint } = await import('@/lib/tokens');
    const member = { id: 'm1', email: 'Old@Example.com', passwordHash: '$2a$12$abc' };
    const token = signEmailChangeToken(member, ' New@Example.com ');
    const t = readPurposeToken(token, 'change_email');
    expect(t).toMatchObject({ ok: true, memberId: 'm1', email: 'new@example.com', from: 'old@example.com', pwd: passwordFingerprint(member.passwordHash) });
    expect(readSessionToken(token)).toBeNull();
    // Not usable as any other kind of link either.
    expect(readPurposeToken(token, 'verify_email')).toEqual({ ok: false, reason: 'wrong_purpose' });
  });

  it('expires after two days', async () => {
    const { signEmailChangeToken, EMAIL_CHANGE_DAYS } = await import('@/lib/tokens');
    const payload = jwt.decode(signEmailChangeToken({ id: 'm1', email: 'a@b.c', passwordHash: 'h' }, 'n@b.c')) as { iat: number; exp: number };
    expect(payload.exp - payload.iat).toBe(EMAIL_CHANGE_DAYS * 24 * 3600);
  });
});

describe('email-change emails', () => {
  it('escape names, and only the confirmation carries a link', async () => {
    const { confirmEmailChangeEmail, emailAlreadyUsedEmail } = await import('@/lib/emails/emailChangeEmails');
    const evil = '<img src=x onerror=alert(1)>';
    const a = confirmEmailChangeEmail({ name: evil, confirmUrl: 'https://fm.test/verify-email?token=t' });
    const b = emailAlreadyUsedEmail({ name: evil });
    for (const { html } of [a, b]) {
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    }
    expect(a.html).toContain('href="https://fm.test/verify-email?token=t"');
    expect(b.html).not.toContain('verify-email');
  });
});
