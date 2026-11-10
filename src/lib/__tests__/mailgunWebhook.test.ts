import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyMailgunSignature, permanentFailure, signatureToken } from '@/lib/mailgunWebhook';

// The bounce route's database and rate-limit table, in memory.
const h = vi.hoisted(() => ({ updates: [] as unknown[], keys: new Map<string, number>(), failNextUpdate: false }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    member: {
      updateMany: async (args: unknown) => {
        if (h.failNextUpdate) { h.failNextUpdate = false; throw new Error('database down'); }
        h.updates.push(args);
        return { count: 1 };
      },
    },
  },
}));
vi.mock('@/lib/rateLimit', () => ({
  rateKey: (prefix: string, value: string) => `${prefix}:${value}`,
  hitRateLimit: async (key: string, limit: number) => {
    const n = h.keys.get(key) ?? 0;
    if (n >= limit) return { allowed: false, count: n, retryAfterSeconds: 60 };
    h.keys.set(key, n + 1);
    return { allowed: true, count: n + 1, retryAfterSeconds: 60 };
  },
  clearRateLimit: async (key: string) => { h.keys.delete(key); },
}));
const { POST } = await import('@/app/api/webhooks/email-bounce/route');

const KEY = 'test-signing-key';
const now = 1_790_000_000;
const sign = (timestamp: string, token: string, key = KEY) => ({
  timestamp, token, signature: crypto.createHmac('sha256', key).update(timestamp + token).digest('hex'),
});

describe('verifyMailgunSignature', () => {
  it('accepts a report Mailgun signed', () => {
    expect(verifyMailgunSignature(sign(String(now), 'abc123'), KEY, now)).toBe(true);
  });
  it('refuses a forged, tampered, stale or missing signature', () => {
    expect(verifyMailgunSignature(sign(String(now), 'abc123', 'wrong-key'), KEY, now)).toBe(false);
    expect(verifyMailgunSignature({ ...sign(String(now), 'abc123'), token: 'changed' }, KEY, now)).toBe(false);
    expect(verifyMailgunSignature(sign(String(now - 3600), 'abc123'), KEY, now)).toBe(false);
    expect(verifyMailgunSignature(undefined, KEY, now)).toBe(false);
    expect(verifyMailgunSignature(sign(String(now), 'abc123'), '', now)).toBe(false);
  });
});

describe('permanentFailure', () => {
  const report = (over: Record<string, unknown>) => ({
    'event-data': { event: 'failed', severity: 'permanent', recipient: 'Olivia@Example.com',
      'delivery-status': { description: 'No such user', message: '550 5.1.1 user unknown' }, ...over },
  });
  it('reads the address and reason from a permanent failure', () => {
    expect(permanentFailure(report({}))).toEqual({ email: 'olivia@example.com', reason: 'No such user' });
  });
  it('ignores temporary failures and every other event', () => {
    expect(permanentFailure(report({ severity: 'temporary' }))).toBeNull();
    expect(permanentFailure(report({ event: 'delivered' }))).toBeNull();
    expect(permanentFailure({ type: 'bounced', email: 'someone@example.com' })).toBeNull(); // the old made-up shape
    expect(permanentFailure(null)).toBeNull();
  });
});

describe('signatureToken', () => {
  it('reads the token from a signature, or null', () => {
    expect(signatureToken(sign(String(now), 'abc123'))).toBe('abc123');
    expect(signatureToken({ token: '' })).toBeNull();
    expect(signatureToken(undefined)).toBeNull();
  });
});

describe('the bounce webhook acts on each signed report once', () => {
  const original = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  beforeEach(() => {
    process.env.MAILGUN_WEBHOOK_SIGNING_KEY = KEY;
    h.updates = [];
    h.keys.clear();
    h.failNextUpdate = false;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (original === undefined) delete process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
    else process.env.MAILGUN_WEBHOOK_SIGNING_KEY = original;
  });

  const report = (token: string) => ({
    signature: sign(String(Math.floor(Date.now() / 1000)), token),
    'event-data': { event: 'failed', severity: 'permanent', recipient: 'olivia@example.com', 'delivery-status': { description: 'No such user' } },
  });
  const post = (body: unknown) =>
    POST(new NextRequest('https://fastmatch.test/api/webhooks/email-bounce', { method: 'POST', body: JSON.stringify(body) }));

  it('marks the address bounced the first time, and ignores the same report sent again', async () => {
    const body = report('token-1');
    const first = await post(body);
    expect(first.status).toBe(200);
    expect(h.updates).toHaveLength(1);

    // A replay of the same signed report (within its 15 minutes): 200, so
    // Mailgun wouldn't retry it, but nothing changes.
    const again = await post(body);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, duplicate: true });
    expect(h.updates).toHaveLength(1);

    // A different report (a new token) is acted on as usual.
    await post(report('token-2'));
    expect(h.updates).toHaveLength(2);
  });

  it('forgets the token when the change couldn\'t be saved, so Mailgun\'s retry counts', async () => {
    h.failNextUpdate = true;
    const body = report('token-3');
    expect((await post(body)).status).toBe(500);
    expect(h.updates).toHaveLength(0);
    expect((await post(body)).status).toBe(200);
    expect(h.updates).toHaveLength(1);
  });

  it('still refuses an unsigned report before looking at its token', async () => {
    const res = await post({ ...report('token-4'), signature: { timestamp: '1', token: 'token-4', signature: 'nope' } });
    expect(res.status).toBe(401);
    expect(h.keys.size).toBe(0);
  });
});
