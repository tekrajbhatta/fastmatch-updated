import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { nameProblem, nameProblemSentence, shortName } from '@/lib/personName';
import { tellAFriendEmail } from '@/lib/emails/friendEmail';
import { validateFriends } from '@/lib/friendBooking';
import nextConfig from '../../../next.config.mjs';

// D4 (Tell A Friend can't be used to send phishing), D12 (the check-in list
// shows other attendees as "Anna S.") and D9 (security headers). The
// database, the signed-in member, email and the rate limits are stood in for;
// the routes themselves run for real.

const h = vi.hoisted(() => ({
  session: null as any,
  members: [] as any[],
  creates: [] as any[],
  deletes: [] as any[],
  emails: [] as { to: string; subject: string; html: string }[],
  siteEmailAllowed: true,
  afterQueue: [] as (() => unknown)[],
  ownBooking: null as any,
  roster: [] as any[],
  ratingAudience: 'OPPOSITE_GENDER',
}));

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => unknown) => { h.afterQueue.push(fn); },
}));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => '$2a$04$hash'), compare: vi.fn(async () => false) } }));
vi.mock('@/lib/rateLimit', async (orig) => ({
  ...(await orig<typeof import('@/lib/rateLimit')>()),
  hitRateLimit: vi.fn(async () => ({ allowed: true, count: 1, retryAfterSeconds: 60 })),
}));
vi.mock('@/lib/emailVolume', () => ({ allowSiteEmail: vi.fn(async () => h.siteEmailAllowed) }));
vi.mock('@/lib/emails/send', () => ({ sendEmail: vi.fn(async (m: { to: string; subject: string; html: string }) => { h.emails.push(m); }) }));
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  getSessionMember: vi.fn(async () => h.session),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    member: {
      findUnique: vi.fn(async ({ where }: any) => h.members.find((m) => m.email.toLowerCase() === String(where.email).toLowerCase()) ?? null),
      create: vi.fn(async ({ data }: any) => { const m = { id: `new-${h.creates.length}`, ...data }; h.creates.push(m); return m; }),
      delete: vi.fn(async ({ where }: any) => { h.deletes.push(where); return {}; }),
    },
    booking: {
      findUnique: vi.fn(async () => h.ownBooking),
      findMany: vi.fn(async () => h.roster),
    },
    event: { findUniqueOrThrow: vi.fn(async () => ({ ratingAudience: h.ratingAudience })) },
  },
}));

const post = (url: string, body: unknown) =>
  new NextRequest(`https://fastmatch.test${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const runAfter = async () => { const q = h.afterQueue.splice(0); for (const fn of q) await fn(); };

const member = (over: Record<string, unknown> = {}) => ({
  id: 'm1', name: 'Olivia Brown', email: 'olivia@example.com', gender: 'FEMALE', cityId: 'city-1',
  mobileVerified: true, emailVerified: true, agreedTerms: true, isAdmin: false, ...over,
});

beforeAll(() => { process.env.JWT_SECRET = 'test-secret-for-security-requests-2'; process.env.APP_URL = 'https://fastmatch.test'; });
beforeEach(() => {
  h.session = null; h.members = []; h.creates = []; h.deletes = []; h.emails = []; h.siteEmailAllowed = true;
  h.afterQueue = []; h.ownBooking = null; h.roster = []; h.ratingAudience = 'OPPOSITE_GENDER';
});

describe('names: a web address typed without http:// or www. (D4a)', () => {
  it('still lets every ordinary name through, dots, initials and all', () => {
    for (const n of [
      'Anna', "Mary-Jane O'Neil", 'J. R. Smith', 'J.R. Smith', 'J.R.R. Tolkien', 'St. John', 'St.John', 'Jo.Anne', 'Mary.Lou',
      'Zoë Ândré', '李小龙', 'Dev Test2', 'Dr. Who', 'Ph.D Smith', 'Mr. Smith Jr.', 'Anne-Marie St.Clair', 'M.E. Jones', 'D.J.',
      // An initial written against a surname that happens to be a web ending.
      'H.Ly', 'K.Au', 'J.Co', 'O.Me', 'Thanh Ly', 'K. Au-Yeung',
      // Surname particles after an initial, which the endings leave out on purpose.
      'J.De Villiers', 'M.La Rue', 'K.Al Masri', 'T.To', 'H.So', 'A.In',
      'Jo.Lynn', 'Sam.Comet', 'Anna Smith.', 'Anna (Annie)',
    ]) {
      expect(nameProblem(n), n).toBeNull();
    }
  });

  it('refuses a bare web address, with the same message as one with http:// or www.', () => {
    for (const n of [
      'evil.example/claim', 'bit.ly/x', 'bit.ly', 'site.com.au', 'Anna evil.com', 'Claim at prize.xyz', 'Sam (sam.info)', 'EVIL.COM',
      'go to t.co/abc', 'scam-site.online', 'Win at lucky.vip now', 'myname.me', 'free.tk', 'Visit fastmatch-prizes.com/claim',
    ]) {
      expect(nameProblem(n), n).toBe('That looks like a web address. Please enter their name');
    }
    expect(nameProblem('Olivia from prize.club', 'your')).toBe('That looks like a web address. Please enter your name');
    expect(nameProblemSentence('Anna evil.com.au', 'the member’s')).toBe('That looks like a web address. Please enter the member’s name.');
  });

  it('keeps its other checks in order, and stays quick on a very long name', () => {
    expect(nameProblem('anna@evil.com')).toBe('That looks like an email address. Please enter their name');
    expect(nameProblem('12345')).toBe('Please enter their name using letters');
    const started = performance.now();
    expect(nameProblem('a'.repeat(1_000_000))).toBe('Please use a shorter name');
    expect(nameProblem('a-'.repeat(50))).toBeNull();
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('applies wherever names are checked: a friend on a booking, say (and sign-up, profile, admin and import, which share it)', () => {
    const friend = { gender: 'MALE' as const, name: 'Sam bit.ly/win', mobile: '0412 345 678', email: 'sam@example.com', dateOfBirth: '1990-01-01' };
    const errors = validateFriends([friend], { ageMin: 18, ageMax: 99, memberEmail: 'olivia@example.com' });
    expect(errors).toContainEqual({ index: 0, field: 'name', message: 'That looks like a web address. Please enter their name' });
  });
});

describe('the Tell A Friend invitation (D4b, D4c)', () => {
  const friend = { email: 'friend@example.com', name: 'Sam', mobile: '0412 000 111', gender: 'MALE', age: 30 };

  it('has the same subject whoever sends it; who invited them is only inside, escaped', () => {
    const { subject, html } = tellAFriendEmail({ friendName: 'Sam', inviterName: 'Claim your prize at <b>evil.example</b>', setPasswordUrl: 'https://fastmatch.test/set-password?token=t' });
    expect(subject).toBe("You've been invited to join FastMatch");
    expect(html).toContain('Claim your prize at &lt;b&gt;evil.example&lt;/b&gt;');
  });

  it('needs the member’s mobile confirmed, and says so with nothing made or sent', async () => {
    h.session = member({ mobileVerified: false });
    const { POST } = await import('@/app/api/tell-a-friend/route');
    const res = await POST(post('/api/tell-a-friend', friend));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Please confirm your mobile number before inviting friends.', unfinished: ['mobile'] });
    await runAfter();
    expect(h.creates).toHaveLength(0);
    expect(h.emails).toHaveLength(0);
  });

  it('with a confirmed mobile, invites as before, under the fixed subject', async () => {
    h.session = member();
    const { POST } = await import('@/app/api/tell-a-friend/route');
    const res = await POST(post('/api/tell-a-friend', friend));
    expect(await res.json()).toEqual({ ok: true, name: 'Sam', email: 'friend@example.com' });
    await runAfter();
    expect(h.creates).toHaveLength(1);
    expect(h.emails.map((e) => [e.to, e.subject])).toEqual([['friend@example.com', "You've been invited to join FastMatch"]]);
    expect(h.emails[0].html).toContain('Olivia Brown');
  });

  it('past the site-wide hourly ceiling: the usual reply, nothing sent, and the account undone', async () => {
    h.session = member();
    h.siteEmailAllowed = false;
    const { POST } = await import('@/app/api/tell-a-friend/route');
    const res = await POST(post('/api/tell-a-friend', friend));
    expect(await res.json()).toEqual({ ok: true, name: 'Sam', email: 'friend@example.com' });
    await runAfter();
    expect(h.emails).toHaveLength(0);
    expect(h.deletes).toEqual([{ id: 'new-0' }]);
  });

  it('refuses a friend’s name holding a web address', async () => {
    h.session = member();
    const { POST } = await import('@/app/api/tell-a-friend/route');
    const res = await POST(post('/api/tell-a-friend', { ...friend, name: 'Sam evil.com.au' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('That looks like a web address. Please enter your friend’s first name.');
  });
});

describe('other attendees on the night: first name and last initial (D12)', () => {
  it('shortName', () => {
    expect(shortName('Anna Smith')).toBe('Anna S.');
    expect(shortName('  Anna   Smith  ')).toBe('Anna S.');
    expect(shortName('Mary Jane Smith')).toBe('Mary S.');
    expect(shortName("Mary-Jane O'Neil")).toBe('Mary-Jane O.');
    expect(shortName('Anna de Souza')).toBe('Anna S.');
    expect(shortName('Anna Smith-Jones')).toBe('Anna S.');
    expect(shortName('Anna Smith -')).toBe('Anna S.');
    expect(shortName('anna smith')).toBe('anna S.');
    expect(shortName('Zoë Ândré')).toBe('Zoë Â.');
    expect(shortName('Anna S.')).toBe('Anna S.');
    expect(shortName('Anna (Annie) Lee')).toBe('Anna L.');
    expect(shortName('Anna 2')).toBe('Anna');
    expect(shortName('Anna')).toBe('Anna');
    expect(shortName('Mary-Jane')).toBe('Mary-Jane');
    expect(shortName('李小龙')).toBe('李小龙');
    expect(shortName('')).toBe('');
  });

  const roster = [
    { badge: 1, member: { id: 'm1', name: 'Olivia Brown', gender: 'FEMALE' } },
    { badge: 2, member: { id: 'm2', name: 'Sam Taylor-Wood', gender: 'MALE' } },
    { badge: 3, member: { id: 'm3', name: 'Josh  van der Berg', gender: 'MALE' } },
    { badge: 4, member: { id: 'm4', name: 'Emma Stone', gender: 'FEMALE' } },
  ];
  const get = async () => {
    const { GET } = await import('@/app/api/events/[eventId]/checkin/route');
    const res = await GET(new NextRequest('https://fastmatch.test/api/events/e1/checkin'), { params: Promise.resolve({ eventId: 'e1' }) });
    return { status: res.status, body: await res.json() };
  };

  it('a member checked in sees the others as "Sam T.", and their own name in full', async () => {
    h.session = member();
    h.ownBooking = { status: 'CONFIRMED', checkedIn: true };
    h.roster = roster;
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body).toEqual([
      { badge: 1, memberId: 'm1', name: 'Olivia Brown' },
      { badge: 2, memberId: 'm2', name: 'Sam T.' },
      { badge: 3, memberId: 'm3', name: 'Josh B.' },
    ]);
  });

  it('the admin sees everyone, in full', async () => {
    h.session = member({ id: 'admin', isAdmin: true });
    h.roster = roster;
    const { body } = await get();
    expect(body.map((r: { name: string }) => r.name)).toEqual(['Olivia Brown', 'Sam Taylor-Wood', 'Josh  van der Berg', 'Emma Stone']);
  });

  it('nobody who isn’t checked in gets the list at all, as before', async () => {
    h.session = member();
    h.ownBooking = { status: 'CONFIRMED', checkedIn: false };
    h.roster = roster;
    expect((await get()).status).toBe(403);
  });
});

describe('security headers (D9)', () => {
  it('HSTS for a year, without includeSubDomains or preload; the CSP closes plug-ins, <base> and outside form posts', async () => {
    const rules = await (nextConfig as { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> }).headers();
    const all = rules.find((r) => r.source === '/:path*')!.headers;
    const header = (key: string) => all.find((x) => x.key === key)?.value;
    expect(header('Strict-Transport-Security')).toBe('max-age=31536000');
    const csp = header('Content-Security-Policy')!.split(';').map((d) => d.trim());
    expect(csp).toEqual(["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]);
    // Scripts and styles are deliberately left alone for now.
    expect(csp.some((d) => d.startsWith('script-src') || d.startsWith('style-src') || d.startsWith('default-src'))).toBe(false);
  });
});
