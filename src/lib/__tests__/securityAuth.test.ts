import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

/**
 * Security batch S3 ("login and limits"): what logging in, resetting a
 * password, inviting a friend and the verification texts may and may not do.
 * The database, the rate limits, email, texts and the signed-in member are
 * stood in for; the routes themselves run for real.
 */

const h = vi.hoisted(() => ({
  /** Rate-limit keys (by prefix) that are refused. */
  refused: new Set<string>(),
  /** Every rate-limit key counted, in order. */
  hits: [] as string[],
  members: [] as any[],
  creates: [] as any[],
  updates: [] as any[],
  deletes: [] as any[],
  emails: [] as { to: string; subject: string }[],
  texts: [] as { to: string; body: string }[],
  emailFails: false,
  session: null as any,
  /** Work handed to after(), run when a test says so. */
  afterQueue: [] as (() => unknown)[],
  compares: 0,
}));

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => unknown) => { h.afterQueue.push(fn); },
}));

vi.mock('@/lib/rateLimit', async (orig) => {
  const real = await orig<typeof import('@/lib/rateLimit')>();
  return {
    ...real,
    clientIp: () => '203.0.113.5',
    rateKey: (prefix: string, value: string) => `${prefix}:${value.trim().toLowerCase()}`,
    hitRateLimit: vi.fn(async (key: string) => {
      h.hits.push(key);
      return { allowed: !h.refused.has(key.split(':')[0]), count: 1, retryAfterSeconds: 60 };
    }),
    isRateLimited: vi.fn(async () => false),
    clearRateLimit: vi.fn(async () => {}),
    clearLoginLock: vi.fn(async () => {}),
  };
});

const findMember = (where: any) =>
  h.members.find((m) => (where.id && m.id === where.id) || (where.email && m.email.toLowerCase() === String(where.email).toLowerCase())) ?? null;

vi.mock('@/lib/prisma', () => ({
  prisma: {
    member: {
      findUnique: vi.fn(async ({ where }: any) => findMember(where)),
      create: vi.fn(async ({ data }: any) => { const m = { id: `new-${h.creates.length}`, ...data }; h.creates.push(m); return m; }),
      update: vi.fn(async ({ where, data }: any) => { h.updates.push({ where, data }); return { ...findMember(where), ...data }; }),
      delete: vi.fn(async ({ where }: any) => { h.deletes.push(where); return {}; }),
    },
    city: { findUnique: vi.fn(async ({ where }: any) => (where.id === 'city-1' ? { id: 'city-1', name: 'Sydney' } : null)) },
    pendingSignup: { deleteMany: vi.fn(async () => ({ count: 0 })), create: vi.fn(async () => ({})) },
  },
}));

vi.mock('@/lib/emails/send', () => ({
  sendEmail: vi.fn(async (m: { to: string; subject: string }) => {
    if (h.emailFails) throw new Error('mail server down');
    h.emails.push(m);
  }),
}));
vi.mock('@/lib/sms/send', () => ({ sendSms: vi.fn(async (m: { to: string; body: string }) => { h.texts.push(m); }) }));

vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  getSessionMember: vi.fn(async () => h.session),
}));

const post = (url: string, body: unknown) =>
  new NextRequest(`https://fastmatch.test${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const patch = (url: string, body: unknown) =>
  new NextRequest(`https://fastmatch.test${url}`, { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const runAfter = async () => { const q = h.afterQueue.splice(0); for (const fn of q) await fn(); };

/** A whole member row, as the database would give it. */
function memberRow(over: Record<string, unknown> = {}) {
  return {
    id: 'm1', email: 'Olivia@Example.com', passwordHash: '$2a$04$abcdefghijklmnopqrstuuJ8m0hD0YkB7wq1r2h9r3Wq0b1c2d3e4',
    emailVerified: true, mobileVerified: true, mobileVerificationCode: '123456', mobileVerificationExpires: null,
    name: 'Olivia', gender: 'FEMALE', dateOfBirth: new Date('1990-01-01'), mobile: '0412 345 678', cityId: 'city-1',
    agreedTerms: true, agreedTermsAt: null, marketingOptIn: true, contactMethod: 'EMAIL_AND_SMS', emailBounced: false,
    bounceReason: 'mailbox full', isAdmin: false, awaitingPasswordSetup: false, passwordSetByAdmin: false,
    referredById: null, createdAt: new Date(), updatedAt: new Date(), stripeCustomerId: 'cus_123',
    ...over,
  };
}

beforeAll(() => { process.env.JWT_SECRET = 'test-secret-for-security-auth'; process.env.APP_URL = 'https://fastmatch.test'; });
beforeEach(() => {
  h.refused = new Set(); h.hits = []; h.members = []; h.creates = []; h.updates = []; h.deletes = [];
  h.emails = []; h.texts = []; h.emailFails = false; h.session = null; h.afterQueue = [];
});

describe('passwords longer than the new limit', () => {
  it('cutting a typed password to PASSWORD_MAX gives bcrypt the same answer as the whole thing', async () => {
    const { passwordToCheck, PASSWORD_MAX } = await import('@/lib/tokens');
    const long = 'é'.repeat(70) + 'x'.repeat(100); // 170 characters, multi-byte first
    const hash = await bcrypt.hash(long, 4);
    expect(passwordToCheck(long)).toHaveLength(PASSWORD_MAX);
    expect(await bcrypt.compare(passwordToCheck(long), hash)).toBe(true);
    expect(await bcrypt.compare(passwordToCheck('wrong' + long), hash)).toBe(false);
  });

  it('a member whose old password is over 128 characters can still log in with it', async () => {
    const long = 'p'.repeat(150);
    h.members = [memberRow({ passwordHash: await bcrypt.hash(long, 4) })];
    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(post('/api/auth/login', { email: 'olivia@example.com', password: long }));
    expect(res.status).toBe(200);
  });

  it('something absurdly long gets the usual "Invalid email or password"', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(post('/api/auth/login', { email: 'olivia@example.com', password: 'p'.repeat(5000) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid email or password');
  });

  it('a new password over 128 characters is refused with a message saying so', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const res = await POST(post('/api/auth/register', {
      name: 'Olivia', gender: 'FEMALE', email: 'olivia@example.com', password: 'p'.repeat(129), cityId: 'city-1',
      dateOfBirth: '1990-01-01', mobile: '0412 345 678', agreedTerms: true,
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at most 128 characters/);
  });
});

describe('logging in', () => {
  it('counts every attempt from the address BEFORE the password check, and stops a burst there', async () => {
    h.members = [memberRow()];
    h.refused.add('login-ip-all');
    const { POST } = await import('@/app/api/auth/login/route');
    const { prisma } = await import('@/lib/prisma');
    vi.mocked(prisma.member.findUnique).mockClear();
    const res = await POST(post('/api/auth/login', { email: 'someone@example.com', password: 'whatever1' }));
    expect(res.status).toBe(429);
    // Refused before the account was even looked up, let alone checked.
    expect(prisma.member.findUnique).not.toHaveBeenCalled();
    expect(h.hits[0]).toBe('login-ip-all:203.0.113.5');
  });

  it('an imported member\'s placeholder password never matches, not even itself', async () => {
    const marker = '!imported:0123456789abcdef01234567';
    h.members = [memberRow({ passwordHash: marker })];
    const { POST } = await import('@/app/api/auth/login/route');
    for (const password of [marker, '!imported:', 'x']) {
      const res = await POST(post('/api/auth/login', { email: 'olivia@example.com', password }));
      expect(res.status, password).toBe(401);
    }
  });
});

describe('change password', () => {
  it('a few guesses at the current password per member, counted before checking it', async () => {
    h.session = memberRow();
    h.refused.add('change-password');
    const { POST } = await import('@/app/api/auth/change-password/route');
    const res = await POST(post('/api/auth/change-password', { currentPassword: 'guess-1', newPassword: 'new-password' }));
    expect(res.status).toBe(429);
    expect(h.updates).toHaveLength(0);
  });

  it('a placeholder (imported) password is never "your current password"', async () => {
    h.session = memberRow({ passwordHash: '!imported:0123456789abcdef01234567' });
    const { POST } = await import('@/app/api/auth/change-password/route');
    const res = await POST(post('/api/auth/change-password', { currentPassword: '!imported:0123456789abcdef01234567', newPassword: 'new-password' }));
    expect(res.status).toBe(400);
    expect(h.updates).toHaveLength(0);
  });
});

describe('forgot password', () => {
  it('answers before looking anything up, the same for a member and a stranger', async () => {
    h.members = [memberRow()];
    const { POST } = await import('@/app/api/auth/forgot-password/route');
    const a = await POST(post('/api/auth/forgot-password', { email: 'olivia@example.com' }));
    const b = await POST(post('/api/auth/forgot-password', { email: 'nobody@example.com' }));
    expect(await a.json()).toEqual({ ok: true });
    expect(await b.json()).toEqual({ ok: true });
    // Nothing sent yet: both replies went first.
    expect(h.emails).toHaveLength(0);
    await runAfter();
    // Only the member is emailed, at the address on the account.
    expect(h.emails.map((e) => e.to)).toEqual(['Olivia@Example.com']);
    expect(h.emails[0].subject).toBe('Reset your FastMatch password');
  });

  it('a few a day per address on top of the hourly limit, with the same reply', async () => {
    h.members = [memberRow()];
    h.refused.add('reset-email-day');
    const { POST } = await import('@/app/api/auth/forgot-password/route');
    const res = await POST(post('/api/auth/forgot-password', { email: 'olivia@example.com' }));
    expect(await res.json()).toEqual({ ok: true });
    expect(h.afterQueue).toHaveLength(0);
    expect(h.hits).toContain('reset-email-day:olivia@example.com');
  });

  it('a mail-server failure is logged, never shown', async () => {
    h.members = [memberRow()];
    h.emailFails = true;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { POST } = await import('@/app/api/auth/forgot-password/route');
    const res = await POST(post('/api/auth/forgot-password', { email: 'olivia@example.com' }));
    expect(await res.json()).toEqual({ ok: true });
    await runAfter();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('Tell A Friend', () => {
  const friend = { email: 'friend@example.com', name: 'Sam', mobile: '0412 000 111', gender: 'MALE', age: 30 };

  it('the same quick reply whether or not the friend is already on FastMatch; the account comes after', async () => {
    h.session = memberRow();
    const { POST } = await import('@/app/api/tell-a-friend/route');
    // A new address: the reply goes before the account is made.
    const fresh = await POST(post('/api/tell-a-friend', friend));
    expect(await fresh.json()).toEqual({ ok: true, name: 'Sam', email: 'friend@example.com' });
    expect(h.creates).toHaveLength(0);
    await runAfter();
    expect(h.creates).toHaveLength(1);
    expect(h.emails.map((e) => e.to)).toEqual(['friend@example.com']);

    // Already a member: the very same reply, and nothing made or sent.
    h.members = [memberRow({ id: 'm2', email: 'friend@example.com' })];
    const known = await POST(post('/api/tell-a-friend', friend));
    expect(await known.json()).toEqual({ ok: true, name: 'Sam', email: 'friend@example.com' });
    await runAfter();
    expect(h.creates).toHaveLength(1);
    expect(h.emails).toHaveLength(1);
  });

  it('a failed invitation is undone and logged with the address masked, not reported as a 502', async () => {
    h.session = memberRow();
    h.emailFails = true;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { POST } = await import('@/app/api/tell-a-friend/route');
    const res = await POST(post('/api/tell-a-friend', friend));
    expect(res.status).toBe(200);
    await runAfter();
    expect(h.deletes).toHaveLength(1);
    const logged = err.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('f***@e***.com');
    expect(logged).not.toContain('friend@example.com');
    err.mockRestore();
  });

  it('mistakes in the form are still answered straight away', async () => {
    h.session = memberRow();
    const { POST } = await import('@/app/api/tell-a-friend/route');
    const res = await POST(post('/api/tell-a-friend', { ...friend, email: 'Olivia@Example.com' }));
    expect(res.status).toBe(400);
    expect(h.afterQueue).toHaveLength(0);
  });
});

describe('sign-up for an address that is already a member', () => {
  it('emails the address as saved on the account, not as typed', async () => {
    h.members = [memberRow()];
    const { POST } = await import('@/app/api/auth/register/route');
    const res = await POST(post('/api/auth/register', {
      name: 'Someone', gender: 'FEMALE', email: 'OLIVIA@example.com', password: 'password1', cityId: 'city-1',
      dateOfBirth: '1990-01-01', mobile: '0412 345 678', agreedTerms: true,
    }));
    expect(await res.json()).toEqual({ ok: true });
    expect(h.emails.map((e) => e.to)).toEqual(['Olivia@Example.com']);
  });
});

describe('verification texts', () => {
  it('a few to any one number, however it is written, whoever asks', async () => {
    const { textMobileCode, sendMobileVerification } = await import('@/lib/memberVerification');
    expect(await textMobileCode({ id: 'a', mobile: '0412 345 678' })).toBe('sent');
    expect(await textMobileCode({ id: 'b', mobile: '+61412345678' })).toBe('sent');
    // Both counted against the one number.
    expect(h.hits.filter((k) => k.startsWith('sms-to:'))).toEqual(['sms-to:61412345678', 'sms-to:61412345678']);
    expect(h.hits.filter((k) => k.startsWith('sms-to-day:'))).toEqual(['sms-to-day:61412345678', 'sms-to-day:61412345678']);

    h.refused.add('sms-to');
    h.texts = []; h.updates = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await textMobileCode({ id: 'c', mobile: '0412 345 678' })).toBe('limited');
    // Held back like a text that couldn't go: no new code, nothing sent.
    expect(await sendMobileVerification({ id: 'c', mobile: '0412 345 678' })).toBe(false);
    expect(h.texts).toHaveLength(0);
    expect(h.updates).toHaveLength(0);
    expect(String(warn.mock.calls[0][0])).not.toContain('345 678');
    warn.mockRestore();
  });

  it('the daily limit holds them back too', async () => {
    h.refused.add('sms-to-day');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { textMobileCode } = await import('@/lib/memberVerification');
    expect(await textMobileCode({ id: 'a', mobile: '0412 345 678' })).toBe('limited');
    expect(h.texts).toHaveLength(0);
  });

  it('"Resend code" says why when the number has had its share', async () => {
    h.session = memberRow({ mobileVerified: false });
    h.refused.add('sms-to');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { POST } = await import('@/app/api/auth/resend-mobile-code/route');
    const res = await POST(post('/api/auth/resend-mobile-code', {}));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/several codes to this number/);
  });
});

describe('the mobile on My Account', () => {
  const save = (over: Record<string, unknown>) =>
    patch('/api/account/profile', { name: 'Olivia', email: 'Olivia@Example.com', mobile: '0412 345 678', cityId: 'city-1', ...over });

  it('the same number written differently is not a change, and stays as saved', async () => {
    h.session = memberRow();
    const { PATCH } = await import('@/app/api/account/profile/route');
    const res = await PATCH(save({ mobile: '+61412345678' }));
    expect(res.status).toBe(200);
    expect(h.updates[0].data).not.toHaveProperty('mobile');
    expect(h.updates[0].data).not.toHaveProperty('mobileVerified');
    expect(h.texts).toHaveLength(0);
  });

  it('a member imported without a mobile can\'t save something that isn\'t one', async () => {
    h.session = memberRow({ mobile: '', mobileVerified: false });
    const { PATCH } = await import('@/app/api/account/profile/route');
    const res = await PATCH(save({ mobile: 'call me' }));
    expect(res.status).toBe(400);
    expect(h.updates).toHaveLength(0);
  });

  it('a new number is saved as typed (trimmed), unconfirmed, and texted a code', async () => {
    h.session = memberRow();
    h.members = [memberRow()];
    const { PATCH } = await import('@/app/api/account/profile/route');
    const res = await PATCH(save({ mobile: '  0498 765 432 ' }));
    expect(res.status).toBe(200);
    expect(h.updates[0].data).toMatchObject({ mobile: '0498 765 432', mobileVerified: false });
    expect((await res.json()).smsSent).toBe(true);
  });
});

describe('what a member is sent about their own account', () => {
  it('/api/auth/me sends only the fields the pages use', async () => {
    h.session = memberRow();
    const { GET } = await import('@/app/api/auth/me/route');
    const { OWN_DETAILS_FIELDS } = await import('@/app/api/account/ownDetails');
    const { member } = await (await GET(new NextRequest('https://fastmatch.test/api/auth/me'))).json();
    expect(Object.keys(member).sort()).toEqual([...OWN_DETAILS_FIELDS].sort());
    for (const secret of ['passwordHash', 'mobileVerificationCode', 'stripeCustomerId', 'bounceReason', 'awaitingPasswordSetup', 'referredById']) {
      expect(member, secret).not.toHaveProperty(secret);
    }
  });

  it('so does My Account\'s profile, read and saved', async () => {
    h.session = memberRow();
    const { GET, PATCH } = await import('@/app/api/account/profile/route');
    const read = await (await GET(new NextRequest('https://fastmatch.test/api/account/profile'))).json();
    expect(read).not.toHaveProperty('passwordHash');
    expect(read).not.toHaveProperty('stripeCustomerId');
    expect(read).toMatchObject({ name: 'Olivia', email: 'Olivia@Example.com', mobile: '0412 345 678', cityId: 'city-1' });
    const saved = await (await PATCH(patch('/api/account/profile', { name: 'Liv', email: 'Olivia@Example.com', mobile: '0412 345 678', cityId: 'city-1' }))).json();
    expect(saved).not.toHaveProperty('passwordHash');
    expect(saved).toMatchObject({ name: 'Liv', emailChangePending: null, mobileChangePending: false });
  });
});

describe('the set-password link', () => {
  it('is read like every other emailed link: HS256 only, made for setting a password', async () => {
    h.members = [memberRow({ awaitingPasswordSetup: true, referredBy: null, _count: { bookings: 0 } })];
    const { GET } = await import('@/app/api/auth/set-password/route');
    const ask = (token: string) => GET(new NextRequest(`https://fastmatch.test/api/auth/set-password?token=${token}`));
    const claims = { memberId: 'm1', purpose: 'set_password', email: 'olivia@example.com' };
    expect((await ask(jwt.sign(claims, process.env.JWT_SECRET!, { algorithm: 'HS256', expiresIn: '1d' }))).status).toBe(200);
    expect((await ask(jwt.sign(claims, process.env.JWT_SECRET!, { algorithm: 'HS512', expiresIn: '1d' }))).status).toBe(400);
    expect((await ask(jwt.sign({ ...claims, purpose: 'password_reset' }, process.env.JWT_SECRET!, { expiresIn: '1d' }))).status).toBe(400);
    expect((await ask('')).status).toBe(400);
  });
});
