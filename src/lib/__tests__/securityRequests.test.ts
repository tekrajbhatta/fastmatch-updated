import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { isCrossSiteRequest, describeErrorForLog, withErrorHandling } from '@/lib/withErrorHandling';
import { pictureUrlProblem, normaliseLink, websiteProblem, checkNewEvent } from '@/lib/eventInput';
import { blastFilterSchema, campaignPatchSchema } from '@/lib/campaigns/fields';

// Batch S4b, "request hardening": requests sent from other websites, what
// errors put in the log, and the admin's addresses and blast filters.

const base = { pathname: '/api/account/profile', host: 'fastmatch.com.au', secFetchSite: null, appUrl: 'https://fastmatch.com.au' };

describe('requests from another website (isCrossSiteRequest)', () => {
  it('lets a page on this site through, by its own host or APP_URL’s', () => {
    expect(isCrossSiteRequest({ ...base, method: 'POST', origin: 'https://fastmatch.com.au' })).toBe(false);
    // Behind Nginx the Host header may be the internal one: APP_URL's host still counts.
    expect(isCrossSiteRequest({ ...base, method: 'PATCH', origin: 'https://fastmatch.com.au', host: '127.0.0.1:3000' })).toBe(false);
    // A second test server on :3001 while APP_URL names :3000: its own host counts.
    expect(isCrossSiteRequest({ ...base, method: 'POST', origin: 'http://localhost:3001', host: 'localhost:3001', appUrl: 'http://localhost:3000' })).toBe(false);
  });

  it('turns away a change sent from any other site, a sister subdomain included', () => {
    for (const origin of ['https://evil.example', 'https://evil.fastmatch.com.au', 'http://fastmatch.com.au:8080', 'null', 'junk']) {
      expect(isCrossSiteRequest({ ...base, method: 'POST', origin }), origin).toBe(true);
    }
    expect(isCrossSiteRequest({ ...base, method: 'DELETE', origin: 'https://evil.example' })).toBe(true);
  });

  it('with no Origin, goes by the browser’s Sec-Fetch-Site; no browser at all is let through', () => {
    expect(isCrossSiteRequest({ ...base, method: 'POST', origin: null, secFetchSite: 'cross-site' })).toBe(true);
    expect(isCrossSiteRequest({ ...base, method: 'POST', origin: null, secFetchSite: 'same-site' })).toBe(true);
    expect(isCrossSiteRequest({ ...base, method: 'POST', origin: null, secFetchSite: 'same-origin' })).toBe(false);
    expect(isCrossSiteRequest({ ...base, method: 'POST', origin: null, secFetchSite: null })).toBe(false);
  });

  it('never stops reading (GET, HEAD, OPTIONS)', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(isCrossSiteRequest({ ...base, method, origin: 'https://evil.example', secFetchSite: 'cross-site' })).toBe(false);
    }
  });

  it('leaves the webhooks and the one-click unsubscribe alone (other services post to them)', () => {
    for (const pathname of ['/api/stripe/webhook', '/api/webhooks/email-bounce', '/api/unsubscribe/one-click']) {
      expect(isCrossSiteRequest({ ...base, pathname, method: 'POST', origin: 'https://mail.google.com', secFetchSite: 'cross-site' }), pathname).toBe(false);
    }
    // ...but not the unsubscribe page's own form, which is a page on this site.
    expect(isCrossSiteRequest({ ...base, pathname: '/api/unsubscribe', method: 'POST', origin: 'https://evil.example' })).toBe(true);
  });

  it('is applied to every wrapped route, before the route runs', async () => {
    const handler = vi.fn(async (_req: NextRequest, _ctx: unknown) => NextResponse.json({ ok: true }));
    const route = withErrorHandling(handler);
    const from = (origin: string) =>
      new NextRequest('https://fastmatch.com.au/api/feedback', { method: 'POST', headers: { origin, host: 'fastmatch.com.au' }, body: '{}' });
    const refused = await route(from('https://evil.example'), {});
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: 'This request came from another site.' });
    expect(handler).not.toHaveBeenCalled();
    expect((await route(from('https://fastmatch.com.au'), {})).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('what an unexpected error puts in the log', () => {
  afterEach(() => vi.restoreAllMocks());

  it('a Prisma error: its kind, code and first line, never the values in the query', () => {
    const validation = new Prisma.PrismaClientValidationError(
      '\nInvalid `prisma.member.update()` invocation:\n\n{ data: { name: "Jane Smith", email: "jane@example.com" } }\n\nArgument `x` is missing.',
      { clientVersion: '5.22.0' },
    );
    expect(describeErrorForLog(validation)).toBe('PrismaClientValidationError: Invalid `prisma.member.update()` invocation:');
    const known = new Prisma.PrismaClientKnownRequestError('Unique constraint failed on jane@example.com\nmore', { code: 'P2002', clientVersion: '5.22.0' });
    expect(describeErrorForLog(known)).toBe('PrismaClientKnownRequestError P2002: Unique constraint failed on jane@example.com');
  });

  it('anything else keeps its full stack', () => {
    const err = new Error('boom');
    expect(describeErrorForLog(err)).toBe(err);
  });

  it('is what the wrapper logs', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const route = withErrorHandling(async (_req: NextRequest, _ctx: unknown): Promise<NextResponse> => {
      throw new Prisma.PrismaClientValidationError('Invalid `prisma.member.create()` invocation:\n{ email: "jane@example.com" }', { clientVersion: '5.22.0' });
    });
    const res = await route(new NextRequest('https://fastmatch.com.au/api/x'), {});
    expect(res.status).toBe(500);
    expect(String(log.mock.calls[0][0])).not.toContain('jane@example.com');
  });
});

describe('addresses the admin types (event, venue and blast forms)', () => {
  it('pictures: an upload, a picture on this site, or an http(s) address; blank is fine', () => {
    for (const ok of ['', null, undefined, '/api/uploads/0123456789abcdef0123456789abcdef.jpg', '/photos/p4_pink_shirt.jpg', 'https://cdn.example.com/a.png', 'http://localhost:3000/api/uploads/a.jpg']) {
      expect(pictureUrlProblem(ok), String(ok)).toBeNull();
    }
    for (const bad of ['javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', '//evil.example/a.png', '/\\evil.example/a.png', 'a.png', 'https://']) {
      expect(pictureUrlProblem(bad), bad).toMatch(/upload the picture again/);
    }
  });

  it('Book Now: http(s) or a page on this site; a site typed without https:// gets it', () => {
    expect(normaliseLink('https://fastmatch.com.au/events/abc')).toEqual({ ok: true, value: 'https://fastmatch.com.au/events/abc' });
    expect(normaliseLink('/events')).toEqual({ ok: true, value: '/events' });
    expect(normaliseLink('')).toEqual({ ok: true, value: '' });
    expect(normaliseLink(null)).toEqual({ ok: true, value: null });
    expect(normaliseLink('www.fastmatch.com.au/events')).toEqual({ ok: true, value: 'https://www.fastmatch.com.au/events' });
    for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', '//evil.example', 'mailto:x@y.z', 'just some words']) {
      expect(normaliseLink(bad).ok, bad).toBe(false);
    }
  });

  it('a venue website is kept as typed, with or without https://', () => {
    for (const ok of ['ggbar.com.au', 'www.chunglo.com.au', 'https://ggbar.com.au/whats-on', 'bar.com.au/menu?x=1', '', null]) {
      expect(websiteProblem(ok), String(ok)).toBeNull();
    }
    for (const bad of ['javascript:alert(1)', 'not a website', '<b>bar</b>.com']) {
      expect(websiteProblem(bad), bad).not.toBeNull();
    }
  });

  it('an event photo that isn’t a picture address is reported against its box', () => {
    const event = {
      themeId: 't', name: 'Ages 28-40', startsAt: '2026-12-01T08:00:00.000Z', cityId: 'c', venueId: 'v',
      ageMin: 28, ageMax: 40, cost: 55, maxMen: 12, maxWomen: 12,
    };
    expect(checkNewEvent({ ...event, photoUrl: '/api/uploads/0123456789abcdef0123456789abcdef.jpg' }).ok).toBe(true);
    const bad = checkNewEvent({ ...event, photoUrl: 'javascript:alert(1)' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.fieldErrors.photoUrl).toMatch(/upload the picture again/);
  });

  it('a blast’s pictures and link follow the same rules', () => {
    expect(campaignPatchSchema.safeParse({ photoUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(campaignPatchSchema.safeParse({ bannerImageUrl: 'data:image/png;base64,AAAA' }).success).toBe(false);
    expect(campaignPatchSchema.safeParse({ venueLogoUrl: '' }).success).toBe(true);
    expect(campaignPatchSchema.parse({ bookingLink: 'fastmatch.com.au/events' }).bookingLink).toBe('https://fastmatch.com.au/events');
    expect(campaignPatchSchema.safeParse({ bookingLink: 'javascript:alert(1)' }).success).toBe(false);
  });
});

describe('a blast’s filter (blastFilterSchema)', () => {
  it('takes what the pages send: the Members filter and the Send tab’s boxes', () => {
    const filter = { search: 'gil', gender: 'FEMALE', cityId: 'clx123', ageMin: 28, ageMax: 40, contactMethods: ['EMAIL', 'SMS'], marketingOptInOnly: true };
    expect(blastFilterSchema.parse(filter)).toEqual(filter);
    expect(blastFilterSchema.parse({})).toEqual({});
    // Empty boxes mean "not filtered on".
    expect(blastFilterSchema.parse({ gender: '', cityId: null })).toEqual({});
  });

  it('refuses query operators in place of values, and drops fields it doesn’t know', () => {
    expect(blastFilterSchema.safeParse({ cityId: { not: 'x' } }).success).toBe(false);
    expect(blastFilterSchema.safeParse({ gender: { in: ['MALE', 'FEMALE'] } }).success).toBe(false);
    expect(blastFilterSchema.safeParse({ search: 42 }).success).toBe(false);
    expect(blastFilterSchema.safeParse({ ageMin: 'old' }).success).toBe(false);
    expect(blastFilterSchema.safeParse({ contactMethods: ['DO_NOT_CONTACT'] }).success).toBe(false);
    // Set by the server only: never taken from the request.
    expect(blastFilterSchema.parse({ mobileMatchIds: ['a'], excludeBookedIn: { eventId: null }, reachableBy: {} })).toEqual({});
    expect(campaignPatchSchema.safeParse({ filter: { cityId: { not: 'x' } } }).success).toBe(false);
  });
});
