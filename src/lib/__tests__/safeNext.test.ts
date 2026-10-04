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

  it('falls back when there is nothing to follow', () => {
    expect(safeNext(null, '/admin', O)).toBe('/admin');
    expect(safeNext('', '/admin', O)).toBe('/admin');
  });
});
