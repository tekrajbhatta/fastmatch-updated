import { describe, it, expect } from 'vitest';
import { RICH_PREFIX, isRich, toEditorHtml, fromEditorHtml, richToPlainText, wrapLooseLines } from '@/lib/richText';
import { cleanRichHtml, cleanStoredRich } from '@/lib/richTextClean';
import { renderCampaignEmailHtml } from '@/lib/emails/campaignEmail';
import { campaignPatchSchema } from '@/lib/campaigns/fields';
import { OFFERING_OPTIONS, offeringLabel, priceWithOffering } from '@/lib/eventOffering';
import { blastEventDetails } from '@/lib/campaigns/blastFill';
import { checkEventEdit } from '@/lib/eventInput';

/**
 * Gil, Nov: the blast's heading and free text in an editor ("highlight the
 * heading and change colour to red", "make bold 'however'", "create a
 * registration link"); "Offerings" under the event's cost; a Cost column on
 * the events list (a page, checked in the browser).
 */

describe('the blast editor', () => {
  it('shows plain text as it is emailed, and stores what it makes, marked', () => {
    expect(toEditorHtml('BY POPULAR DEMAND\nWE ARE BACK', 'heading')).toBe('BY POPULAR DEMAND<br>WE ARE BACK');
    expect(toEditorHtml('One & two\n\nThree', 'text')).toBe('<p>One &amp; two</p><p>Three</p>');
    expect(fromEditorHtml('<b>Hi</b>', 'Hi')).toBe(`${RICH_PREFIX}<b>Hi</b>`);
    // Nothing written: empty, so "is it empty?" checks still work.
    expect(fromEditorHtml('<br>', '')).toBe('');
    expect(isRich('plain')).toBe(false);
    expect(richToPlainText(`${RICH_PREFIX}<p><b>HOWEVER.....</b></p><p>Click &amp; go</p>`)).toBe('HOWEVER.....\nClick & go');
  });

  it("keeps the editor's formatting: bold, colour, highlight, size, links", () => {
    const html = '<span style="color: rgb(226, 35, 26); background-color: rgb(255, 242, 0);">BY POPULAR DEMAND!!</span>'
      + '<p><b>HOWEVER.....</b></p><p><span style="font-size: 24px;">Big</span> <a href="https://fastmatch.com.au/register">CLICK HERE TO RE-REGISTER</a></p>';
    // The same, its styles written compactly.
    expect(cleanRichHtml(html)).toBe(
      '<span style="color:rgb(226, 35, 26);background-color:rgb(255, 242, 0)">BY POPULAR DEMAND!!</span>'
      + '<p><b>HOWEVER.....</b></p><p><span style="font-size:24px">Big</span> <a href="https://fastmatch.com.au/register">CLICK HERE TO RE-REGISTER</a></p>',
    );
  });

  it('removes anything else: scripts, event handlers, javascript links, pictures, other styles', () => {
    expect(cleanRichHtml('<script>alert(1)</script>Hi')).toBe('Hi');
    expect(cleanRichHtml('<img src=x onerror="alert(1)">Hi')).toBe('Hi');
    expect(cleanRichHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(cleanRichHtml('<span onclick="x()" style="position:fixed;color:red">x</span>')).toBe('<span style="color:red">x</span>');
    expect(cleanRichHtml('<span style="background-image:url(https://evil)">x</span>')).toBe('<span>x</span>');
    expect(cleanRichHtml('<iframe src="https://evil"></iframe><style>body{}</style>ok')).toBe('ok');
  });

  it('cleans what is saved, and leaves plain text alone', () => {
    const parsed = campaignPatchSchema.parse({
      heading: `${RICH_PREFIX}<b onmouseover="x()">Hi</b><script>bad()</script>`,
      freeText: 'Plain <3 text\nsecond line',
    });
    expect(parsed.heading).toBe(`${RICH_PREFIX}<b>Hi</b>`);
    expect(parsed.freeText).toBe('Plain <3 text\nsecond line');
    // Only formatting, no words: stored as empty.
    expect(cleanStoredRich(`${RICH_PREFIX}<b><br></b>`)).toBe('');
  });

  it('emails it: the heading in its <h1>, free text as spaced paragraphs; plain text as before', () => {
    const html = renderCampaignEmailHtml({
      heading: `${RICH_PREFIX}<div><span style="color:red">BY POPULAR DEMAND</span></div><p>WE ARE BACK</p>`,
      freeText: `${RICH_PREFIX}<p><b>HOWEVER.....</b></p><p style="text-align:center">Then <a href="https://x.test/register">register</a></p>`,
      unsubscribeUrl: 'https://x.test/u',
      clean: cleanRichHtml,
    });
    expect(html).toContain('<span style="color:red">BY POPULAR DEMAND</span></div><div>WE ARE BACK</div></h1>');
    expect(html).toContain('<p style="margin:0 0 14px;"><b>HOWEVER.....</b></p>');
    expect(html).toContain('<p style="margin:0 0 14px;text-align:center">Then <a href="https://x.test/register">register</a></p>');
    const plain = renderCampaignEmailHtml({ heading: 'A & B\nC', freeText: 'One\nTwo', unsubscribeUrl: 'u' });
    expect(plain).toContain('A &amp; B<br/>C</h1>');
    expect(plain).toContain('<p style="margin:0 0 14px;">One</p><p style="margin:0 0 14px;">Two</p>');
  });
});

describe('lines typed outside a paragraph', () => {
  it('become paragraphs, so every line is spaced the same in the email', () => {
    expect(wrapLooseLines('First <b>line</b><p>Second</p>Third')).toBe('<p>First <b>line</b></p><p>Second</p><p>Third</p>');
    expect(wrapLooseLines('<p>One</p><br><p>Two</p>')).toBe('<p>One</p><p>Two</p>');
    expect(wrapLooseLines('<p>Already</p><div>fine</div>')).toBe('<p>Already</p><div>fine</div>');
    const html = renderCampaignEmailHtml({ freeText: `${RICH_PREFIX}We're back.<p><b>HOWEVER.....</b></p>`, unsubscribeUrl: 'u', clean: cleanRichHtml });
    expect(html).toContain('<div><p style="margin:0 0 14px;">We\'re back.</p><p style="margin:0 0 14px;"><b>HOWEVER.....</b></p></div>');
  });
});

describe('Offerings', () => {
  it("has Gil's choices, no extras first", () => {
    expect(OFFERING_OPTIONS.map((o) => o.label)).toEqual(['No extras', 'inc one drink', 'inc two drinks', 'inc food', 'inc food and drinks', 'prizes and giveaways']);
  });

  it('shows beside the price, and nothing for no extras', () => {
    expect(offeringLabel('NONE')).toBeNull();
    expect(offeringLabel(undefined)).toBeNull();
    expect(priceWithOffering('$49', 'ONE_DRINK')).toBe('$49 · inc one drink');
    expect(priceWithOffering('$49', 'NONE')).toBe('$49');
  });

  it('goes into a blast’s event details', () => {
    const e = { startsAt: '2027-01-20T08:00:00Z', cost: 49, city: { name: 'Sydney' }, venue: { name: 'The Nags Head' } };
    expect(blastEventDetails({ ...e, offering: 'FOOD_AND_DRINKS' })).toContain('Cost: $49 · inc food and drinks');
    expect(blastEventDetails(e)).toMatch(/Cost: \$49$/);
  });

  it('is saved with the event: no extras unless chosen', () => {
    const edit = checkEventEdit({ offering: 'TWO_DRINKS' }, { ageMin: 37, ageMax: 50 });
    expect(edit.ok && edit.data.offering).toBe('TWO_DRINKS');
    expect(checkEventEdit({ offering: 'CHAMPAGNE' }, { ageMin: 37, ageMax: 50 }).ok).toBe(false);
    // An edit that doesn't mention it leaves it as it is.
    const other = checkEventEdit({ maxMen: 12 }, { ageMin: 37, ageMax: 50 });
    expect(other.ok && 'offering' in other.data ? other.data.offering : undefined).toBeUndefined();
  });
});
