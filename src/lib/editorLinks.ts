/**
 * Links in the blast editor (src/components/RichTextEditor.tsx), made on the
 * page itself rather than with the browser's own editing commands: those
 * work on the text box's live selection, and on a phone the selection is
 * gone by then (typing the address in the link box takes the focus, and an
 * iPhone clears the selection when the box gets it).
 *
 * Places in the text are also kept as "marks": how many characters into
 * the editor's text they are. They still find the same words after the
 * editor's HTML has been rewritten (free text is tidied into paragraphs when
 * the cursor leaves it), when a saved Range would point at nothing.
 *
 * Browser only (it uses the page's document).
 */

export interface Marks { start: number; end: number }

/** Every piece of text in the editor, in order. */
function textNodes(root: Node): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

/** How many characters of the editor's text come before this place in it. */
function charsBefore(root: Node, node: Node, offset: number): number {
  const r = document.createRange();
  r.setStart(root, 0);
  r.setEnd(node, offset);
  return r.toString().length;
}

/** A selection in the editor as marks; null when it isn't in the editor. */
export function marksOf(root: HTMLElement, range: Range): Marks | null {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  return { start: charsBefore(root, range.startContainer, range.startOffset), end: charsBefore(root, range.endContainer, range.endOffset) };
}

/**
 * The words at these marks, as a Range. A start falling between two pieces
 * of text goes at the beginning of the later one (with the words it starts),
 * an end at the end of the earlier one, and a cursor (nothing selected) at
 * the end of the earlier one, so it isn't taken into the next link.
 */
export function rangeAt(root: HTMLElement, marks: Marks): Range {
  const range = document.createRange();
  const texts = textNodes(root);
  const place = (at: number, later: boolean): [Text, number] | null => {
    let seen = 0;
    for (const t of texts) {
      const len = t.data.length;
      if (later ? at < seen + len : at <= seen + len) return [t, at - seen];
      seen += len;
    }
    return null;
  };
  const toEnd = () => { range.selectNodeContents(root); range.collapse(false); return range; };
  if (marks.start === marks.end) {
    const p = place(marks.start, false);
    if (!p) return toEnd();
    range.setStart(p[0], p[1]);
    range.collapse(true);
    return range;
  }
  const start = place(marks.start, true);
  if (!start) return toEnd();
  range.setStart(start[0], start[1]);
  const end = place(marks.end, false);
  if (end) range.setEnd(end[0], end[1]);
  else range.setEnd(root, root.childNodes.length);
  return range;
}

/** Is this saved Range still in the editor (and not in HTML since replaced)? */
export function stillIn(root: HTMLElement, range: Range): boolean {
  return range.startContainer.isConnected && range.endContainer.isConnected && root.contains(range.startContainer) && root.contains(range.endContainer);
}

/** The link this place is in, if any. */
function closestLink(root: HTMLElement, node: Node): HTMLAnchorElement | null {
  for (let n: Node | null = node; n && n !== root; n = n.parentNode) if (n instanceof HTMLAnchorElement) return n;
  return null;
}

/** The link the cursor, or the whole selection, is in (to change or remove it). */
export function linkAround(root: HTMLElement, range: Range): HTMLAnchorElement | null {
  const a = closestLink(root, range.startContainer);
  return a && a === closestLink(root, range.endContainer) ? a : null;
}

/** The links a selection touches, or the one the cursor is in. */
export function linksIn(root: HTMLElement, range: Range): HTMLAnchorElement[] {
  const inside = linkAround(root, range);
  if (inside) return [inside];
  return [...root.querySelectorAll('a')].filter((a) => range.intersectsNode(a));
}

const IN_WORD = /[\p{L}\p{N}'’_\-./@:]/u;

/**
 * The cursor in the middle of a word, with nothing selected: that word (as
 * in Google Docs, where Link then links the word the cursor is in). Full
 * stops and the like at its end aren't part of it. Null otherwise.
 */
export function wordAround(range: Range): Range | null {
  if (!range.collapsed || range.startContainer.nodeType !== Node.TEXT_NODE) return null;
  const t = range.startContainer as Text;
  const s = t.data;
  const i = range.startOffset;
  if (i === 0 || i >= s.length || !IN_WORD.test(s[i - 1]) || !IN_WORD.test(s[i])) return null;
  let from = i;
  let to = i;
  while (from > 0 && IN_WORD.test(s[from - 1])) from--;
  while (to < s.length && IN_WORD.test(s[to])) to++;
  while (to > from && /[.:/\-]/.test(s[to - 1])) to--;
  if (to <= from) return null;
  const word = document.createRange();
  word.setStart(t, from);
  word.setEnd(t, to);
  return word;
}

const INLINE = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'SPAN', 'FONT']);

/**
 * A new link that is all of a bold (coloured, sized…) piece goes around that
 * piece instead of inside it: <a><b>word</b></a>, so pieces side by side can
 * become one link.
 */
function liftLink(root: HTMLElement, a: HTMLAnchorElement): HTMLAnchorElement {
  for (let p = a.parentElement; p && p !== root && INLINE.has(p.tagName) && p.childNodes.length === 1; p = a.parentElement) {
    p.replaceWith(a);
    while (a.firstChild) p.appendChild(a.firstChild);
    a.appendChild(p);
  }
  return a;
}

/**
 * The words at these marks become one link, keeping their formatting. Links
 * they were part of are replaced by this one. Returns the (first) link made.
 */
export function wrapInLink(root: HTMLElement, marks: Marks, href: string): HTMLAnchorElement | null {
  for (const a of linksIn(root, rangeAt(root, marks))) unwrapLink(a);
  const range = rangeAt(root, marks);
  const parts: [Text, number, number][] = [];
  for (const t of textNodes(root)) {
    if (!range.intersectsNode(t)) continue;
    const from = t === range.startContainer ? range.startOffset : 0;
    const to = t === range.endContainer ? range.endOffset : t.data.length;
    // Not the spaces between paragraphs.
    if (from < to && !(t.parentNode === root && !t.data.slice(from, to).trim())) parts.push([t, from, to]);
  }
  const made: HTMLAnchorElement[] = [];
  for (const [t, from, to] of parts) {
    if (to < t.data.length) t.splitText(to);
    const piece = from > 0 ? t.splitText(from) : t;
    const a = document.createElement('a');
    a.setAttribute('href', href);
    piece.replaceWith(a);
    a.appendChild(piece);
    made.push(liftLink(root, a));
  }
  // Pieces side by side become one link.
  for (const a of made) {
    const before = a.previousSibling;
    if (before instanceof HTMLAnchorElement && before.getAttribute('href') === href && !before.getAttribute('style') && !a.getAttribute('style')) {
      while (a.firstChild) before.appendChild(a.firstChild);
      a.remove();
    }
  }
  return made.find((a) => a.isConnected) ?? null;
}

/**
 * New words as a link, at the cursor (in place of the selection, if there is
 * one). Never inside another link: after it.
 */
export function insertLink(root: HTMLElement, range: Range, href: string, text: string): HTMLAnchorElement {
  const r = range.cloneRange();
  if (!r.collapsed) r.deleteContents();
  const around = closestLink(root, r.startContainer);
  if (around) {
    r.setStartAfter(around);
    r.collapse(true);
  }
  const a = document.createElement('a');
  a.setAttribute('href', href);
  a.textContent = text;
  r.insertNode(a);
  return a;
}

const LINE_BREAKS = new Set(['P', 'DIV', 'BR', 'LI']);

/** The character beside this node on its line ('' at the start or end of a line). */
function charBeside(root: HTMLElement, node: Node, after: boolean): string {
  for (let n: Node | null = node; n && n !== root; n = n.parentNode) {
    if (n !== node && n instanceof Element && LINE_BREAKS.has(n.tagName)) return '';
    for (let s = after ? n.nextSibling : n.previousSibling; s; s = after ? s.nextSibling : s.previousSibling) {
      if (s instanceof Element && LINE_BREAKS.has(s.tagName)) return '';
      const text = s.textContent ?? '';
      if (text) return after ? text[0] : text[text.length - 1];
    }
  }
  return '';
}

/**
 * New words put in as a link get a space from the words before them, and
 * from a word straight after them, so "free text." and "Email Gil" don't
 * run together.
 */
export function spaceAround(root: HTMLElement, a: HTMLAnchorElement): void {
  const before = charBeside(root, a, false);
  if (before && !/\s/.test(before)) a.before(' ');
  const after = charBeside(root, a, true);
  if (after && /[\p{L}\p{N}]/u.test(after)) a.after(' ');
}

/**
 * A link back to plain words. Any style the link had of its own (a colour
 * chosen for it) stays on its words.
 */
export function unwrapLink(a: HTMLAnchorElement): void {
  const style = a.getAttribute('style')?.trim();
  if (style) {
    const span = document.createElement('span');
    span.setAttribute('style', style);
    while (a.firstChild) span.appendChild(a.firstChild);
    a.replaceWith(span);
    return;
  }
  a.replaceWith(...Array.from(a.childNodes));
}

const colourOf = (el: Element): string =>
  (el instanceof HTMLElement && el.style.color) || (el.tagName === 'FONT' && el.getAttribute('color')) || '';

/**
 * Each link gets the colour its words have, on the link itself: words
 * coloured and then linked, say, or a link inside coloured words. In an
 * email only a colour on the link itself colours it (and its underline);
 * otherwise mail programs show their own link blue. A link with no colour
 * anywhere stays as it is: plum, in the editor and in the email.
 */
export function settleLinkColours(root: HTMLElement): void {
  for (const a of Array.from(root.querySelectorAll('a'))) {
    if (a.style.color) continue;
    const inner = new Set<string>();
    for (const t of textNodes(a)) {
      if (!t.data.trim()) continue;
      let c = '';
      for (let p = t.parentElement; p && p !== a && !c; p = p.parentElement) c = colourOf(p);
      inner.add(c);
    }
    let colour = inner.size === 1 ? [...inner][0] : '';
    for (let p = a.parentElement; !colour && p && p !== root; p = p.parentElement) colour = colourOf(p);
    if (colour) a.style.color = colour;
  }
}
