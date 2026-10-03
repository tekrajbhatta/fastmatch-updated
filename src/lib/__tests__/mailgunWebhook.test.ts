import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyMailgunSignature, permanentFailure } from '@/lib/mailgunWebhook';

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
