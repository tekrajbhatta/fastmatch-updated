import { describe, it, expect } from 'vitest';
import { safeNext, alreadyLoggedInHref } from '@/lib/safeNext';

const O = 'https://fastmatch.test';

describe('safeNext (after logging in)', () => {
  it('follows a page on this site, keeping its query and anchor', () => {
    expect(safeNext('/events/abc/checkin', '/events', O)).toBe('/events/abc/checkin');
    expect(safeNext('/account?tab=1#x', '/events', O)).toBe('/account?tab=1#x');
  });

  it('refuses anything a browser would read as another site', () => {
    for (const bad of [
      'https://evil.example', '//evil.example', '/\\evil.example', '/\t/evil.example', '/\n/evil.example',
      '\\\\evil.example', 'javascript:alert(1)', ' /x', 'events',
    ]) {
      expect(safeNext(bad, '/events', O), JSON.stringify(bad)).toBe('/events');
    }
  });

  it('refuses a path that only becomes "//host" once resolved', () => {
    for (const bad of [
      '/.//evil.example', '/..//evil.example', '/%2e//evil.example', '/./\\evil.example',
      '/a/..//evil.example', '/%2e%2e//evil.example',
    ]) {
      expect(safeNext(bad, '/events', O), JSON.stringify(bad)).toBe('/events');
    }
    // A doubled slash later in the path is still this site.
    expect(safeNext('/events//abc', '/events', O)).toBe('/events//abc');
  });

  it('falls back when there is nothing to follow', () => {
    expect(safeNext(null, '/admin', O)).toBe('/admin');
    expect(safeNext('', '/admin', O)).toBe('/admin');
  });
});

describe('alreadyLoggedInHref (Log in or Sign up while logged in)', () => {
  it('sends a member to My account, and staff to the admin', () => {
    expect(alreadyLoggedInHref('/login', false)).toBe('/account');
    expect(alreadyLoggedInHref('/register', false)).toBe('/account');
    expect(alreadyLoggedInHref('/login', true)).toBe('/admin');
    expect(alreadyLoggedInHref('', false)).toBe('/account');
  });

  it('follows the ?next= they came with, as after logging in', () => {
    expect(alreadyLoggedInHref('/login?next=%2Fevents%2Fabc', false)).toBe('/events/abc');
    expect(alreadyLoggedInHref('/register?next=%2Fevents%2Fabc%3Fx%3D1', false)).toBe('/events/abc?x=1');
    expect(alreadyLoggedInHref('/login?next=%2Fadmin%2Fevents', true)).toBe('/admin/events');
  });

  it('never another site, an admin page for a member, or back to Log in or Sign up', () => {
    expect(alreadyLoggedInHref('/login?next=%2F%2Fevil.example', false)).toBe('/account');
    expect(alreadyLoggedInHref('/login?next=https%3A%2F%2Fevil.example', false)).toBe('/account');
    expect(alreadyLoggedInHref('/login?next=%2F%5Cevil.example', false)).toBe('/account');
    expect(alreadyLoggedInHref('/login?next=%2Fadmin', false)).toBe('/account');
    expect(alreadyLoggedInHref('/login?next=%2Fadmin%2Fmembers', false)).toBe('/account');
    expect(alreadyLoggedInHref('/login?next=%2Flogin', false)).toBe('/account');
    expect(alreadyLoggedInHref('/login?next=%2Fregister%3Fnext%3D%2Fx', true)).toBe('/admin');
    expect(alreadyLoggedInHref('/login?next=%2Flogin%2F', false)).toBe('/account');
  });
});
