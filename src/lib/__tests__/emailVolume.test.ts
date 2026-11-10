import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ counts: new Map<string, number>(), sent: [] as any[] }));
vi.mock('../rateLimit', () => ({
  HOUR: 3600_000,
  hitRateLimit: vi.fn(async (key: string, limit: number) => {
    const c = h.counts.get(key) ?? 0;
    if (c >= limit) return { allowed: false, count: c, retryAfterSeconds: 60 };
    h.counts.set(key, c + 1);
    return { allowed: true, count: c + 1, retryAfterSeconds: 60 };
  }),
}));
vi.mock('../emails/send', () => ({ sendEmail: vi.fn(async (m: any) => { h.sent.push(m); }) }));

import { allowSiteEmail, ALERT_AT, SITE_EMAILS_PER_HOUR } from '../emailVolume';

describe('site-wide ceiling on emails to typed addresses', () => {
  beforeEach(() => { h.counts.clear(); h.sent = []; vi.spyOn(console, 'error').mockImplementation(() => {}); });

  it('lets ordinary traffic through without bothering Gil', async () => {
    for (let i = 0; i < ALERT_AT - 1; i++) expect(await allowSiteEmail('reset')).toBe(true);
    expect(h.sent).toHaveLength(0);
  });

  it('emails Gil once an hour when it gets busy, and keeps sending', async () => {
    h.counts.set('site-emails:typed-addresses', ALERT_AT - 1);
    expect(await allowSiteEmail('reset')).toBe(true);
    expect(await allowSiteEmail('signup')).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].to).toBe('gil@fastmatch.com.au');
    expect(h.sent[0].subject).toMatch(/unusually many/);
  });

  it('holds emails back past the hourly ceiling', async () => {
    h.counts.set('site-emails:typed-addresses', SITE_EMAILS_PER_HOUR);
    expect(await allowSiteEmail('invite')).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(h.sent[0].subject).toMatch(/held back/);
  });
});
