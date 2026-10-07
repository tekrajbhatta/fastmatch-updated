import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  passwordFingerprint,
  signSessionToken,
  readSessionToken,
  sessionStillValid,
  signPasswordResetToken,
  signEmailVerificationToken,
  readPurposeToken,
  sentToCurrentAddress,
} from '@/lib/tokens';
import { setPasswordToken } from '@/lib/memberBooking';

const SECRET = 'test-secret-for-tokens';
beforeAll(() => {
  process.env.JWT_SECRET = SECRET;
});

const member = { id: 'member-1', email: 'Olivia@Example.com', passwordHash: '$2a$12$abcdefghijklmnopqrstuv' };

describe('session tokens', () => {
  it('a session token logs the member in', () => {
    const claims = readSessionToken(signSessionToken(member));
    expect(claims?.memberId).toBe('member-1');
    expect(claims && sessionStillValid(claims, member)).toBe(true);
  });

  it('sessions issued before this change ({ memberId } only) still work', () => {
    const legacy = jwt.sign({ memberId: 'member-1' }, SECRET, { expiresIn: '30d' });
    const claims = readSessionToken(legacy);
    expect(claims?.memberId).toBe('member-1');
    expect(claims && sessionStillValid(claims, member)).toBe(true);
  });

  it.each(['unsubscribe', 'verify_email', 'set_password', 'password_reset'])(
    'an emailed %s token is never accepted as a login',
    (purpose) => {
      const token = jwt.sign({ memberId: 'member-1', purpose }, SECRET);
      expect(readSessionToken(token)).toBeNull();
    },
  );

  it('the real emailed links are refused as logins too', () => {
    expect(readSessionToken(signPasswordResetToken(member))).toBeNull();
    expect(readSessionToken(signEmailVerificationToken(member))).toBeNull();
  });

  it('refuses tokens of another type, forged or expired tokens', () => {
    expect(readSessionToken(jwt.sign({ memberId: 'member-1', typ: 'other' }, SECRET))).toBeNull();
    expect(readSessionToken(jwt.sign({ memberId: 'member-1' }, 'someone-elses-secret'))).toBeNull();
    expect(readSessionToken(jwt.sign({ memberId: 'member-1', exp: Math.floor(Date.now() / 1000) - 60 }, SECRET))).toBeNull();
    expect(readSessionToken('not-a-token')).toBeNull();
  });

  it('a password change signs out sessions issued before it', () => {
    const claims = readSessionToken(signSessionToken(member))!;
    expect(sessionStillValid(claims, { passwordHash: '$2a$12$a-completely-new-hash' })).toBe(false);
  });

  it('never puts the password hash itself in the token', () => {
    const token = signSessionToken(member);
    const payload = jwt.decode(token) as Record<string, unknown>;
    expect(JSON.stringify(payload)).not.toContain(member.passwordHash);
    expect(payload.pwd).toBe(passwordFingerprint(member.passwordHash));
  });
});

describe('emailed links', () => {
  it('a reset link carries the password fingerprint, so it dies once used', () => {
    const t = readPurposeToken(signPasswordResetToken(member), 'password_reset');
    expect(t.ok && t.pwd).toBe(passwordFingerprint(member.passwordHash));
  });

  it('a reset link only works for the address it was sent to, so correcting a mistyped address kills it', () => {
    const t = readPurposeToken(signPasswordResetToken(member), 'password_reset');
    expect(t.ok && sentToCurrentAddress(t, member)).toBe(true);
    expect(t.ok && sentToCurrentAddress(t, { email: 'olivia@example.org' })).toBe(false);
    // Links sent before this carried no address: no longer accepted.
    expect(sentToCurrentAddress({}, member)).toBe(false);
  });

  it('a friend\'s welcome (set-password) link carries the address it was sent to', () => {
    const p = jwt.decode(setPasswordToken(member)) as Record<string, unknown>;
    expect(p).toMatchObject({ memberId: 'member-1', purpose: 'set_password', email: 'olivia@example.com' });
  });

  it('a confirm-email link is tied to the address it was sent to', () => {
    const t = readPurposeToken(signEmailVerificationToken(member), 'verify_email');
    expect(t.ok && t.email).toBe('olivia@example.com');
  });

  it('a link for one purpose is refused for another', () => {
    expect(readPurposeToken(signEmailVerificationToken(member), 'password_reset')).toEqual({ ok: false, reason: 'wrong_purpose' });
    expect(readPurposeToken(signSessionToken(member), 'verify_email')).toEqual({ ok: false, reason: 'wrong_purpose' });
    expect(readPurposeToken('garbage', 'unsubscribe')).toEqual({ ok: false, reason: 'invalid' });
  });
});
