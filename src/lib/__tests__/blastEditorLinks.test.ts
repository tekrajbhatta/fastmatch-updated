import { describe, it, expect } from 'vitest';
import { RICH_PREFIX, linkHref, linkHrefForDisplay, withLinkStyles } from '@/lib/richText';
import { cleanRichHtml } from '@/lib/richTextClean';
import { renderCampaignEmailHtml } from '@/lib/emails/campaignEmail';
import { BRAND_COLORS } from '@/lib/brand';

/**
 * The blast editor's links (the user and Gil, 17 Nov): added in the editor's
 * own link box, not the browser's pop-up (which Gil's iPhone didn't show),
 * and in the email in the colour chosen for them, not the mail program's
 * blue. The box itself is checked in Chrome (Android) and WebKit (iPhone).
 */

describe('what the "Link to" box takes', () => {
  it('a web address, with or without https://', () => {
    expect(linkHref('fastmatch.com.au/register')).toBe('https://fastmatch.com.au/register');
    expect(linkHref('  www.fastmatch.com.au  ')).toBe('https://www.fastmatch.com.au');
    expect(linkHref('https://fastmatch.com.au/events?city=Sydney')).toBe('https://fastmatch.com.au/events?city=Sydney');
    expect(linkHref('HTTP://Fastmatch.com.au')).toBe('HTTP://Fastmatch.com.au');
  });

  it('an email address, as a mailto: link', () => {
    expect(linkHref('gil@fastmatch.com.au')).toBe('mailto:gil@fastmatch.com.au');
    expect(linkHref('mailto:gil@fastmatch.com.au')).toBe('mailto:gil@fastmatch.com.au');
    expect(linkHrefForDisplay('mailto:gil@fastmatch.com.au')).toBe('gil@fastmatch.com.au');
    expect(linkHrefForDisplay('https://fastmatch.com.au')).toBe('https://fastmatch.com.au');
  });

  it('nothing else: words, a name without a dot, other kinds of link', () => {
    for (const bad of ['', '   ', 'click here', 'fastmatch', 'javascript:alert(1)', 'javascript:alert(document.cookie)', 'mailto:nobody', 'ftp://fastmatch.com.au', 'data:text/html,hi']) {
      expect(linkHref(bad), bad).toBeNull();
    }
  });
});

describe('links in the email', () => {
  it('keep the colour, highlight, bold or size given to the whole link (the browsers put it on the link itself)', () => {
    expect(cleanRichHtml('<a href="https://x.test" style="color: rgb(226, 35, 26);">Link</a>')).toBe('<a href="https://x.test" style="color:rgb(226, 35, 26)">Link</a>');
    expect(cleanRichHtml('<a href="https://x.test" style="font-weight: bold; background-color: rgb(255, 242, 0);">Link</a>'))
      .toBe('<a href="https://x.test" style="font-weight:bold;background-color:rgb(255, 242, 0)">Link</a>');
    // Still nothing else.
    expect(cleanRichHtml('<a href="https://x.test" style="position:fixed;color:red" onclick="x()">Link</a>')).toBe('<a href="https://x.test" style="color:red">Link</a>');
    expect(cleanRichHtml('<a href="javascript:alert(1)" style="color:red">Link</a>')).toBe('<a style="color:red">Link</a>');
  });

  it('show in their own colour, or plum as in the editor, underlined (mail programs show their own blue otherwise)', () => {
    const plum = BRAND_COLORS.plum;
    expect(withLinkStyles('<a href="https://x.test">a</a>', plum)).toBe(`<a href="https://x.test" style="color:${plum};text-decoration:underline;">a</a>`);
    expect(withLinkStyles('<a href="https://x.test" style="color:rgb(226, 35, 26)">a</a>', plum))
      .toBe('<a href="https://x.test" style="text-decoration:underline;color:rgb(226, 35, 26)">a</a>');
    expect(withLinkStyles('<a href="https://x.test" style="background-color:#fff200">a</a>', plum))
      .toBe(`<a href="https://x.test" style="color:${plum};text-decoration:underline;background-color:#fff200">a</a>`);
    expect(withLinkStyles('<a href="https://x.test" style="color:red;text-decoration:none">a</a>', plum)).toBe('<a href="https://x.test" style="color:red;text-decoration:none">a</a>');
    // Single quotes, and a ">" inside an address.
    expect(withLinkStyles(`<a href='https://x.test/?a>b' style='color:red'>a</a>`, plum)).toBe(`<a href='https://x.test/?a>b' style="text-decoration:underline;color:red">a</a>`);
    expect(withLinkStyles('<p>No links</p><abbr>x</abbr>', plum)).toBe('<p>No links</p><abbr>x</abbr>');
  });

  it('in the heading and the free text, as the preview shows them', () => {
    const html = renderCampaignEmailHtml({
      heading: `${RICH_PREFIX}Test heading <a href="https://fastmatch.com.au/register" style="color: rgb(226, 35, 26);">Link</a>`,
      freeText: `${RICH_PREFIX}<p>Test free text.</p><p>Click this <a href="https://fastmatch.com.au/register">Link</a></p>`,
      unsubscribeUrl: 'https://x.test/u',
      clean: cleanRichHtml,
    });
    expect(html).toContain('Test heading <a href="https://fastmatch.com.au/register" style="text-decoration:underline;color:rgb(226, 35, 26)">Link</a></h1>');
    expect(html).toContain(`Click this <a href="https://fastmatch.com.au/register" style="color:${BRAND_COLORS.plum};text-decoration:underline;">Link</a></p>`);
  });
});
