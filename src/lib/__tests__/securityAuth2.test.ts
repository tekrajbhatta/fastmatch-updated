import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';

/**
 * Security decisions D6, D7, D11 and D14: a stranger can't lock a member out
 * of logging in; the password-reset launch limits; a sign-up confirmed in
 * another browser asks for the sign-up password; a used reset link confirms
 * the email. The routes run for real; the database, rate limits, email and
 * texts are stood in for.
 */

const h = vi.hoisted(() => ({
  /** Rate-limit keys (by prefix) that are refused. */
  refused: new Set<string>(),
  hits: [] as string[],
  members: [] as any[],
  pending: [] as any[],
  updates: [] as any[],
  emails: [] as { to: string; subject: string; html: string }[],
  siteEmailOk: true,
  afterQueue: [] as (() => unknown)[],
}));

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => unknown) => { h.afterQueue.push(fn); },
}));

vi.mock('@/lib/rateLimit', async (orig) => {
  const real = await orig<typeof import('@/lib/rateLimit')>();
  return {
    ...real,
    clientIp: () => '203.0.113.9',
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
      create: vi.fn(async ({ data }: any) => { const m = { id: `new-${h.members.length}`, ...data }; h.members.push(m); return m; }),
      update: vi.fn(async ({ where, data }: any) => { h.updates.push({ where, data }); return { ...findMember(where), ...data }; }),
    },
    city: { findUnique: vi.fn(async ({ where }: any) => (where.id === 'city-1' ? { id: 'city-1', name: 'Sydney' } : null)) },
    pendingSignup: {
      findUnique: vi.fn(async ({ where }: any) => h.pending.find((p) => p.tokenHash === where.tokenHash) ?? null),
      create: vi.fn(async ({ data }: any) => { const p = { id: `p${h.pending.length}`, createdAt: new Date(), ...data }; h.pending.push(p); return p; }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const before = h.pending.length;
        if (where.email) h.pending = h.pending.filter((p) => p.email.toLowerCase() !== String(where.email).toLowerCase());
        return { count: before - h.pending.length };
      }),
    },
  },
}));

vi.mock('@/lib/emails/send', () => ({
  sendEmail: vi.fn(async (m: { to: string; subject: string; html: string }) => { h.emails.push(m); }),
}));
vi.mock('@/lib/emailVolume', () => ({ allowSiteEmail: vi.fn(async () => h.siteEmailOk) }));
vi.mock('@/lib/memberVerification', () => ({ sendMobileVerification: vi.fn(async () => true) }));

const PASSWORD = 'correct horse 1';

const request = (url: string, body: unknown, cookie?: string) =>
  new NextRequest(`https://fastmatch.test${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });
const runAfter = async () => { const q = h.afterQueue.splice(0); for (const fn of q) await fn(); };

let passwordHash = '';
function memberRow(over: Record<string, unknown> = {}) {
  return {
    id: 'gil-1', email: 'gil@fastmatch.com.au', passwordHash, name: 'Gil', isAdmin: true,
    emailVerified: true, mobileVerified: true, agreedTerms: true, passwordSetByAdmin: false, awaitingPasswordSetup: false,
    ...over,
  };
}

const registration = (email: string) => ({
  name: 'Olivia', gender: 'FEMALE', email, password: PASSWORD, cityId: 'city-1',
  dateOfBirth: '1990-01-01', mobile: '0412 345 678', agreedTerms: true,
});

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-for-security-auth-2';
  process.env.APP_URL = 'https://fastmatch.test';
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});
beforeEach(() => {
  h.refused = new Set(); h.hits = []; h.members = []; h.pending = []; h.updates = []; h.emails = [];
  h.siteEmailOk = true; h.afterQueue = [];
});

describe('D6: strangers can\'t lock someone out of logging in', () => {
  it('past the account\'s any-address cap a stranger is refused, while the owner\'s own browser still logs in', async () => {
    h.members = [memberRow()];
    h.refused.add('login-email'); // strangers have used up the account's cap
    const { POST } = await import('@/app/api/auth/login/route');
    const { deviceCookieWith } = await import('@/lib/auth');

    const stranger = await POST(request('/api/auth/login', { email: 'gil@fastmatch.com.au', password: PASSWORD }));
    expect(stranger.status).toBe(429);

    const owner = await POST(request('/api/auth/login', { email: 'gil@fastmatch.com.au', password: PASSWORD }, `fm_device=${deviceCookieWith(null, 'gil-1')}`));
    expect(owner.status).toBe(200);
  });

  it('the owner\'s browser still counts towards every other limit', async () => {
    h.members = [memberRow()];
    h.refused.add('login-email-ip');
    const { POST } = await import('@/app/api/auth/login/route');
    const { deviceCookieWith } = await import('@/lib/auth');
    const res = await POST(request('/api/auth/login', { email: 'gil@fastmatch.com.au', password: PASSWORD }, `fm_device=${deviceCookieWith(null, 'gil-1')}`));
    expect(res.status).toBe(429);
  });

  it('a cookie for another account, or a made-up one, doesn\'t help', async () => {
    h.members = [memberRow(), memberRow({ id: 'olivia-1', email: 'olivia@example.com', isAdmin: false })];
    h.refused.add('login-email');
    const { POST } = await import('@/app/api/auth/login/route');
    const { deviceCookieWith } = await import('@/lib/auth');
    for (const cookie of [`fm_device=${deviceCookieWith(null, 'olivia-1')}`, 'fm_device=gil-1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'fm_device=gil-1']) {
      const res = await POST(request('/api/auth/login', { email: 'gil@fastmatch.com.au', password: PASSWORD }, cookie));
      expect(res.status, cookie).toBe(429);
    }
  });

  it('an unknown address is counted just like a member\'s, cookie or not (nothing to tell them apart)', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const { deviceCookieWith } = await import('@/lib/auth');
    const res = await POST(request('/api/auth/login', { email: 'nobody@example.com', password: PASSWORD }, `fm_device=${deviceCookieWith(null, 'gil-1')}`));
    expect(res.status).toBe(401);
    // The account-wide count (its key is hashed: the prefix is what shows).
    expect(h.hits.some((k) => k.split(':')[0] === 'login-email')).toBe(true);
  });

  it('logging in remembers the browser for a year; logging out leaves that alone', async () => {
    h.members = [memberRow()];
    const { POST } = await import('@/app/api/auth/login/route');
    const { POST: logout } = await import('@/app/api/auth/logout/route');
    const { deviceKnowsMember } = await import('@/lib/auth');
    const res = await POST(request('/api/auth/login', { email: 'gil@fastmatch.com.au', password: PASSWORD }));
    expect(res.status).toBe(200);
    const header = res.headers.getSetCookie().find((c) => c.startsWith('fm_device='))!;
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/SameSite=lax/i);
    expect(header).toMatch(/Path=\//);
    expect(header).toMatch(/Max-Age=31536000/);
    expect(deviceKnowsMember(res.cookies.get('fm_device')?.value, 'gil-1')).toBe(true);

    // The route takes no arguments itself; its wrapper (withErrorHandling) reads the request.
    const out = await (logout as (req: NextRequest) => Promise<Response>)(request('/api/auth/logout', {}));
    expect(out.headers.getSetCookie().some((c) => c.startsWith('fm_device='))).toBe(false);
  });

  it('a shared computer remembers a few accounts, newest first', async () => {
    const { deviceCookieWith, deviceKnowsMember } = await import('@/lib/auth');
    let cookie: string | null = null;
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) cookie = deviceCookieWith(cookie, id);
    expect(cookie!.split('~').map((e) => e.split('.')[0])).toEqual(['f', 'e', 'd', 'c', 'b']);
    expect(deviceKnowsMember(cookie, 'a')).toBe(false);
    expect(deviceKnowsMember(cookie, 'b')).toBe(true);
    // Logging in again to one already there moves it to the front, once.
    expect(deviceCookieWith(cookie, 'c').split('~').map((e) => e.split('.')[0])).toEqual(['c', 'f', 'e', 'd', 'b']);
  });
});

describe('D7: the password-reset launch', () => {
  it('60 reset requests an hour from one visitor address (mobile networks share them)', async () => {
    const { LIMITS } = await vi.importActual<typeof import('@/lib/rateLimit')>('@/lib/rateLimit');
    expect(LIMITS.resetIp.limit).toBe(60);
    expect(LIMITS.resetEmail.limit).toBe(3);
    expect(LIMITS.resetEmailDaily.limit).toBe(5);
  });

  it('past the site-wide ceiling a reset email isn\'t sent, and the reply is the same', async () => {
    h.members = [memberRow({ isAdmin: false })];
    const { POST } = await import('@/app/api/auth/forgot-password/route');
    h.siteEmailOk = false;
    const held = await POST(request('/api/auth/forgot-password', { email: 'gil@fastmatch.com.au' }));
    expect(await held.json()).toEqual({ ok: true });
    await runAfter();
    expect(h.emails).toHaveLength(0);

    h.siteEmailOk = true;
    await POST(request('/api/auth/forgot-password', { email: 'gil@fastmatch.com.au' }));
    await runAfter();
    expect(h.emails).toHaveLength(1);
  });

  it('past the ceiling a sign-up email isn\'t sent either, and the reply is the same', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    h.siteEmailOk = false;
    const res = await POST(request('/api/auth/register', registration('new@example.com')));
    expect(await res.json()).toEqual({ ok: true });
    expect(h.emails).toHaveLength(0);
  });
});

describe('D11: confirming a sign-up in another browser asks for the sign-up password', () => {
  /** Signs up in "this browser" and returns the link's token and the browser's fm_signup cookie. */
  async function signUp(email = 'new@example.com', cookie?: string) {
    const { POST } = await import('@/app/api/auth/register/route');
    const res = await POST(request('/api/auth/register', registration(email), cookie ? `fm_signup=${cookie}` : undefined));
    expect(res.status).toBe(200);
    const token = /complete-signup\?token=([A-Za-z0-9_-]+)/.exec(h.emails.at(-1)?.html ?? '')?.[1] ?? '';
    return { token, cookie: res.cookies.get('fm_signup')?.value ?? '', setCookie: res.headers.getSetCookie().find((c) => c.startsWith('fm_signup=')) ?? '' };
  }

  it('in the same browser nothing changes: the account is made straight away', async () => {
    const { token, cookie } = await signUp();
    const { POST } = await import('@/app/api/auth/complete-signup/route');
    const res = await POST(request('/api/auth/complete-signup', { token }, `fm_signup=${cookie}`));
    expect(res.status).toBe(200);
    expect(h.members.map((m) => m.email)).toEqual(['new@example.com']);
  });

  it('elsewhere it asks for the password, refuses a wrong one, and accepts the right one', async () => {
    const { token } = await signUp();
    const { POST } = await import('@/app/api/auth/complete-signup/route');

    const asked = await POST(request('/api/auth/complete-signup', { token }));
    expect(asked.status).toBe(401);
    expect(await asked.json()).toEqual({ code: 'PASSWORD_NEEDED', error: 'For your security, please enter the password you chose when you signed up.' });

    const wrong = await POST(request('/api/auth/complete-signup', { token, password: 'not it at all' }));
    expect(wrong.status).toBe(401);
    expect((await wrong.json()).code).toBe('PASSWORD_WRONG');
    expect(h.members).toHaveLength(0);

    const right = await POST(request('/api/auth/complete-signup', { token, password: PASSWORD }));
    expect(right.status).toBe(200);
    expect(h.members).toHaveLength(1);
    // Signed in, and this browser remembered for logging in later.
    expect(right.cookies.get('fm_session')?.value).toBeTruthy();
    expect(right.cookies.get('fm_device')?.value).toMatch(/^new-0\./);
  });

  it('a stranger who signed someone else\'s address up gets nothing when its owner clicks the link', async () => {
    // The stranger's browser has the cookie; the owner's (where the link is clicked) doesn't.
    const { token } = await signUp('victim@example.com');
    const { POST } = await import('@/app/api/auth/complete-signup/route');
    const res = await POST(request('/api/auth/complete-signup', { token }, 'fm_signup=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'));
    expect(res.status).toBe(401);
    expect(h.members).toHaveLength(0);
    expect(h.pending).toHaveLength(1); // still there, for the stranger's password only
  });

  it('a few wrong passwords per link, each counted before it is checked', async () => {
    const { token } = await signUp();
    const { POST } = await import('@/app/api/auth/complete-signup/route');
    h.refused.add('signup-password');
    const res = await POST(request('/api/auth/complete-signup', { token, password: PASSWORD }));
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe('TOO_MANY');
    expect(h.members).toHaveLength(0);
  });

  it('a second go at the form doesn\'t spoil the first email\'s link in the same browser', async () => {
    const first = await signUp('new@example.com');
    const second = await signUp('new@example.com', first.cookie);
    const { POST } = await import('@/app/api/auth/complete-signup/route');
    const res = await POST(request('/api/auth/complete-signup', { token: first.token }, `fm_signup=${second.cookie}`));
    expect(res.status).toBe(200);
  });

  it('the sign-up reply sets the same kind of cookie whether or not the address is a member\'s', async () => {
    const fresh = await signUp('new@example.com');
    h.members = [memberRow({ id: 'm9', email: 'olivia@example.com', isAdmin: false })];
    const { POST } = await import('@/app/api/auth/register/route');
    const known = await POST(request('/api/auth/register', registration('olivia@example.com')));
    expect(await known.json()).toEqual({ ok: true });
    const knownSetCookie = known.headers.getSetCookie().find((c) => c.startsWith('fm_signup='))!;
    const shape = (c: string) => c.replace(/^fm_signup=[A-Za-z0-9_-]{43};/, 'fm_signup=X;').replace(/Expires=[^;]+/, 'Expires=…');
    expect(fresh.setCookie).toMatch(/^fm_signup=[A-Za-z0-9_-]{43};/);
    expect(shape(knownSetCookie)).toBe(shape(fresh.setCookie));
    expect(knownSetCookie).toMatch(/HttpOnly/i);
    expect(knownSetCookie).toMatch(/Max-Age=604800/);
  });
});

describe('D14: a used reset link confirms the email address', () => {
  it('sets emailVerified along with the new password', async () => {
    h.members = [memberRow({ isAdmin: false, emailVerified: false })];
    const { signPasswordResetToken } = await import('@/lib/tokens');
    const { POST } = await import('@/app/api/auth/reset-password/route');
    const token = signPasswordResetToken(h.members[0]);
    const res = await POST(request('/api/auth/reset-password', { token, newPassword: 'a brand new one' }));
    expect(res.status).toBe(200);
    expect(h.updates[0].data).toMatchObject({ emailVerified: true, passwordSetByAdmin: false });
  });
});
