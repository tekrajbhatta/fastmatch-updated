import { describe, it, expect } from 'vitest';
import { oneLine, safeHref, safeSrc } from '@/lib/escapeHtml';
import { venueHref } from '@/lib/venue';
import { campaignPatchSchema } from '@/lib/campaigns/fields';

describe('oneLine (for email subjects)', () => {
  it('turns line breaks into a space, so nothing can be added as a header', () => {
    expect(oneLine('Ann\r\nBcc: everyone@evil.test')).toBe('Ann Bcc: everyone@evil.test');
    expect(oneLine('a\nb\rc\n\n\nd')).toBe('a b c d');
  });

  it('escapes nothing: a subject is plain text, so "&amp;" would show as typed', () => {
    expect(oneLine('Drinks & nibbles <3 "Tom\'s"')).toBe('Drinks & nibbles <3 "Tom\'s"');
  });
});

describe('safeHref', () => {
  it('lets an http(s) link through, attribute-escaped', () => {
    expect(safeHref('https://fastmatch.com.au/events/abc')).toBe('https://fastmatch.com.au/events/abc');
    expect(safeHref('  HTTP://ggbar.com.au  ')).toBe('HTTP://ggbar.com.au');
    expect(safeHref('https://x.test/?a=1&b=2')).toBe('https://x.test/?a=1&amp;b=2');
    expect(safeHref('https://x.test/" onmouseover="alert(1)')).toBe('https://x.test/&quot; onmouseover=&quot;alert(1)');
  });

  it('refuses javascript: and every other scheme, however it is dressed up', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      '  javascript:alert(1)',
      'java\tscript:alert(1)',
      '\u0001javascript:alert(1)',
      'jav&#x09;ascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'mailto:gil@fastmatch.com.au',
      'ftp://x.test/file',
    ]) {
      expect(safeHref(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('refuses what has no scheme, or nothing after it', () => {
    for (const bad of ['//evil.test', '/events', 'ggbar.com.au', 'https://', '', '   ', null, undefined]) {
      expect(safeHref(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('safeSrc', () => {
  it('also takes a path on this site, as an upload’s URL is without APP_URL', () => {
    expect(safeSrc('/api/uploads/0123abcd.jpg')).toBe('/api/uploads/0123abcd.jpg');
    expect(safeSrc('https://fastmatch.com.au/api/uploads/0123abcd.jpg')).toBe('https://fastmatch.com.au/api/uploads/0123abcd.jpg');
  });

  it('but not a path a browser would read as another site, nor any other scheme', () => {
    for (const bad of [
      '//evil.test/a.jpg',
      '/\\evil.test/a.jpg',
      '/\t/evil.test/a.jpg',
      '/\n/evil.test/a.jpg',
      'javascript:alert(1)',
      'data:image/svg+xml,<svg onload=alert(1)>',
      null,
    ]) {
      expect(safeSrc(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('venueHref', () => {
  it('always gives an http(s) link, whatever was typed as the website', () => {
    for (const typed of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' javascript:alert(1)', 'data:text/html,x', 'ggbar.com.au']) {
      expect(venueHref(typed), typed).toMatch(/^https?:\/\//i);
    }
  });
});

describe('blast subject', () => {
  it('is saved on one line, and not escaped', () => {
    expect(campaignPatchSchema.parse({ subject: 'Speed dating\r\nBcc: everyone@evil.test' }).subject).toBe('Speed dating Bcc: everyone@evil.test');
    expect(campaignPatchSchema.parse({ subject: 'Drinks & "nibbles"' }).subject).toBe('Drinks & "nibbles"');
    expect(campaignPatchSchema.parse({ subject: null }).subject).toBeNull();
    expect(campaignPatchSchema.parse({ title: 'x' }).subject).toBeUndefined();
  });
});
