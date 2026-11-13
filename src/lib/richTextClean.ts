import sanitizeHtml from 'sanitize-html';
import { RICH_PREFIX, isRich, richBody } from './richText';

/**
 * What the blast editor's HTML may contain (src/lib/richText.ts), kept to
 * what its toolbar makes: bold, italic, underline, text colour, highlight,
 * text size, links, line breaks and paragraphs. Everything else is removed
 * (scripts, pictures, frames, forms, event handlers, other styles), so
 * nothing in a blast can run in a member's mail program or change the rest
 * of the email. Links only to web pages and email addresses.
 *
 * Applied when a blast is saved, and again when it's sent (sanitize-html,
 * the server only).
 */

const COLOUR = [
  /^#[0-9a-f]{3,8}$/i,
  /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+))?\s*\)$/i,
  /^[a-z]{3,20}$/i,
];

const STYLES: sanitizeHtml.IOptions['allowedStyles'] = {
  '*': {
    color: COLOUR,
    'background-color': COLOUR,
    'font-size': [/^\d{1,2}(\.\d)?px$/, /^(xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large)$/],
    'font-weight': [/^(bold|bolder|normal|[1-9]00)$/],
    'font-style': [/^(italic|normal)$/],
    'text-decoration': [/^(underline|line-through|none)$/],
    'text-decoration-line': [/^(underline|line-through|none)$/],
    'text-align': [/^(left|right|center)$/],
  },
};

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['b', 'strong', 'i', 'em', 'u', 's', 'br', 'p', 'div', 'span', 'a', 'font'],
  allowedAttributes: {
    a: ['href'],
    span: ['style'],
    p: ['style'],
    div: ['style'],
    b: ['style'],
    strong: ['style'],
    i: ['style'],
    em: ['style'],
    u: ['style'],
    font: ['color', 'size'],
  },
  allowedStyles: STYLES,
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  // Dropped with what's inside them, not left as stray text.
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'title', 'head'],
};

/** The editor's HTML with anything it can't contain removed. */
export function cleanRichHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}

/** A heading or free text as it's stored: written in the editor, cleaned (and marked); plain text as it is. */
export function cleanStoredRich(value: string | null | undefined): string | null | undefined {
  if (!isRich(value)) return value;
  const clean = cleanRichHtml(richBody(value));
  // Nothing left but tags (all formatting, no words): stored as empty.
  return sanitizeHtml(clean, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;/g, ' ').trim() ? RICH_PREFIX + clean : '';
}
