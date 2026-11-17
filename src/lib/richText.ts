import { escapeHtml } from './escapeHtml';

/**
 * A blast's heading and free text as written in the blast editor (Gil, Nov:
 * "highlight text, change colour, and font size", bold, a registration link):
 * HTML, marked with RICH_PREFIX so it can be told apart from the plain text
 * blasts had before, and from text the site fills in itself (an event's
 * name, a venue's description), which stays plain. Plain text is still sent
 * exactly as it always was.
 *
 * What the HTML may contain is decided on the server (src/lib/richTextClean.ts,
 * when a blast is saved and again when it's sent). No imports beyond
 * escapeHtml: the blast forms use this in the browser.
 */
export const RICH_PREFIX = '<!--rich-->';

export function isRich(value: string | null | undefined): value is string {
  return !!value && value.startsWith(RICH_PREFIX);
}

/** The HTML part of a value written in the editor. */
export function richBody(value: string): string {
  return value.slice(RICH_PREFIX.length);
}

/** Plain text as editor HTML: a heading's lines with line breaks, free text as one paragraph per line (as it's emailed). */
export function plainToEditorHtml(text: string, kind: 'heading' | 'text'): string {
  const lines = text.split('\n').filter((l) => l.trim()).map(escapeHtml);
  if (kind === 'heading') return lines.join('<br>');
  return lines.map((l) => `<p>${l}</p>`).join('');
}

/** What the editor shows for a stored value, plain or rich. */
export function toEditorHtml(value: string | null | undefined, kind: 'heading' | 'text'): string {
  if (!value) return '';
  return isRich(value) ? richBody(value) : plainToEditorHtml(value, kind);
}

/** What the editor stores: '' when nothing is written, so "is it empty?" checks keep working. */
export function fromEditorHtml(html: string, textContent: string): string {
  return textContent.trim() ? RICH_PREFIX + html : '';
}

/**
 * Free text whose lines aren't all paragraphs (the first line typed into an
 * empty editor, or after selecting everything, isn't one): each loose run of
 * text becomes a paragraph, so the email spaces every line the same way.
 * Only runs with no block tags inside are touched.
 */
export function wrapLooseLines(html: string): string {
  const out: string[] = [];
  const loose = (s: string) => {
    if (!s.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/g, ' ').trim()) return;
    out.push(/<\/?(p|div)\b/i.test(s) ? s : `<p>${s}</p>`);
  };
  const block = /<(p|div)\b[^>]*>[\s\S]*?<\/\1>/gi;
  let last = 0;
  for (let m = block.exec(html); m; m = block.exec(html)) {
    loose(html.slice(last, m.index));
    out.push(m[0]);
    last = block.lastIndex;
  }
  loose(html.slice(last));
  return out.join('');
}

/**
 * The address for a link, from what was typed in the editor's "Link to" box
 * (Gil): an email address becomes a mailto: link, and a web address typed
 * without http:// gets https://. Null for anything that isn't a web page or
 * an email address ("click here", a javascript: link), so the box can say so.
 */
export function linkHref(typed: string): string | null {
  const t = typed.trim();
  if (!t || /\s/.test(t)) return null;
  const email = /^mailto:/i.test(t) ? t.slice(7) : t;
  if (EMAIL_ADDRESS.test(email)) return `mailto:${email}`;
  if (/^mailto:/i.test(t)) return null;
  const address = /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, '')}`;
  try {
    // A site's name has a dot in it (fastmatch.com.au), and "javascript:…"
    // read as a site's name doesn't parse.
    const url = new URL(address);
    return /^https?:$/.test(url.protocol) && url.hostname.includes('.') ? address : null;
  } catch {
    return null;
  }
}

const EMAIL_ADDRESS = /^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/;

/** A link's address as the "Link to" box shows it: an email address without its mailto:. */
export function linkHrefForDisplay(href: string | null | undefined): string {
  return (href ?? '').replace(/^mailto:/i, '');
}

/**
 * Links in an email in the colour the editor shows them in: the colour
 * chosen for them with Colour, or plum, and underlined. Without a colour of
 * their own, mail programs show links in their own blue (Gil's coloured
 * links came out blue in the preview). `html` is the editor's cleaned HTML.
 */
export function withLinkStyles(html: string, colour: string): string {
  return html.replace(/<a\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi, (tag, attrs: string) => {
    const found = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    const style = found ? (found[1] ?? found[2] ?? '') : '';
    const has = (property: string) => new RegExp(`(^|;)\\s*${property}\\s*:`, 'i').test(style);
    const missing = `${has('color') ? '' : `color:${colour};`}${has('text-decoration') || has('text-decoration-line') ? '' : 'text-decoration:underline;'}`;
    if (!missing) return tag;
    const rest = found ? attrs.replace(found[0], '') : attrs;
    return `<a${rest} style="${(missing + style).replace(/"/g, '&quot;')}">`;
  });
}

/** The words only, for anywhere that needs plain text (a heading used as a label, say). */
export function richToPlainText(value: string | null | undefined): string {
  if (!value) return '';
  if (!isRich(value)) return value;
  return richBody(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}
