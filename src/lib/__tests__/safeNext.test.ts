import { describe, it, expect } from 'vitest';
import { safeNext } from '@/lib/safeNext';

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
