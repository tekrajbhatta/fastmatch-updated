import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

/**
 * Gil round 2, batch 8 (G4): unsubscribing stops event news and offers only
 * (Q16, the user, 6 Oct), from the email's link (asked first, then a POST) or
 * the opt-out link in blast texts (by mobile number, as nobody can reply STOP).
 * The database and rate limit are stood in for.
 */
const h = vi.hoisted(() => ({
  candidates: [] as { id: string; mobile: string }[],
  updates: [] as any[],
  allowed: true,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(async () => h.candidates),
    member: { updateMany: vi.fn(async (args: any) => { h.updates.push(args); return { count: 1 }; }) },
  },
}));
vi.mock('@/lib/rateLimit', () => ({
  clientIp: () => '203.0.113.9',
  rateKey: (prefix: string, value: string) => `${prefix}:${value}`,
  LIMITS: { optOutIp: { limit: 10, windowMs: 3600_000 } },
  hitRateLimit: async () => ({ allowed: h.allowed }),
}));

const post = (url: string, body: unknown) =>
  new NextRequest(`https://fastmatch.test${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

beforeAll(() => { process.env.JWT_SECRET = 'test-secret-for-g4'; });
beforeEach(() => { h.candidates = []; h.updates = []; h.allowed = true; });

describe('the opt-out link in blast texts: by mobile number', () => {
  it('stops event news and offers for every member with that number, however it was saved', async () => {
    const { POST } = await import('@/app/api/unsubscribe/mobile/route');
    // Narrowed on the last nine digits by the database; a near miss is weeded out.
    h.candidates = [{ id: 'a', mobile: '0412 345 678' }, { id: 'b', mobile: '+61412345678' }, { id: 'c', mobile: '0512 345 678' }];
    const res = await POST(post('/api/unsubscribe/mobile', { mobile: '0412-345-678' }));
    expect(res.status).toBe(200);
    expect(h.updates).toEqual([{ where: { id: { in: ['a', 'b'] } }, data: { marketingOptIn: false } }]);
  });

  it('answers the same when the number isn\'t ours, so it can\'t be used to look members up', async () => {
    const { POST } = await import('@/app/api/unsubscribe/mobile/route');
    const res = await POST(post('/api/unsubscribe/mobile', { mobile: '0499 999 999' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.updates).toEqual([]);
  });

  it('wants an Australian mobile, and a few tries an hour', async () => {
    const { POST } = await import('@/app/api/unsubscribe/mobile/route');
    expect((await POST(post('/api/unsubscribe/mobile', { mobile: '+44 7911 123456' }))).status).toBe(400);
    h.allowed = false;
    expect((await POST(post('/api/unsubscribe/mobile', { mobile: '0412 345 678' }))).status).toBe(429);
    expect(h.updates).toEqual([]);
  });
});

describe('the Unsubscribe link in blast emails', () => {
  it('unsubscribes when they choose to (a POST with the link\'s token), from marketing only', async () => {
    const { POST } = await import('@/app/api/unsubscribe/route');
    const token = jwt.sign({ memberId: 'm1', purpose: 'unsubscribe' }, 'test-secret-for-g4');
    const res = await POST(post('/api/unsubscribe', { token }));
    expect(res.status).toBe(200);
    expect(h.updates).toEqual([{ where: { id: 'm1' }, data: { marketingOptIn: false } }]);
  });

  it('refuses a token that isn\'t an unsubscribe link', async () => {
    const { POST } = await import('@/app/api/unsubscribe/route');
    const session = jwt.sign({ memberId: 'm1' }, 'test-secret-for-g4');
    expect((await POST(post('/api/unsubscribe', { token: session }))).status).toBe(400);
    expect((await POST(post('/api/unsubscribe', { token: 'preview' }))).status).toBe(400);
    expect(h.updates).toEqual([]);
  });
});
