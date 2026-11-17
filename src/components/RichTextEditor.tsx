'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toEditorHtml, fromEditorHtml, wrapLooseLines, linkHref, linkHrefForDisplay } from '@/lib/richText';
import {
  marksOf, rangeAt, stillIn, linkAround, linksIn, wordAround, wrapInLink, insertLink, unwrapLink, settleLinkColours, spaceAround, type Marks,
} from '@/lib/editorLinks';

/**
 * The blast's heading and free text editor (Gil, Nov: "highlight text, change
 * colour, and font size", bold, a registration link). What it can make is
 * what the server keeps (src/lib/richTextClean.ts): bold, italic, underline,
 * text colour, highlight, text size and links. Pasted text comes in plain,
 * so formatting from Word or a web page can't come along with it; format it
 * here instead.
 *
 * The stored value is marked HTML (src/lib/richText.ts), or '' when empty.
 * Plain text from before the editor, or filled in from a venue or an event,
 * is shown here as it's emailed and becomes HTML once edited.
 *
 * Phones (the user and Gil, 17 Nov): links are added in a box in the editor
 * itself ("Text to show", "Link to"), not the browser's pop-up, which Gil's
 * iPhone didn't show, and which was hard to use on Android. The words
 * selected when a button is touched are kept (an iPhone can drop the
 * selection before the button reacts), the cursor in a word is enough to
 * link that word, and the buttons are finger-sized.
 */

const COLOURS: [string, string][] = [
  ['Black', '#1f1a24'], ['Red', '#e2231a'], ['Dark red', '#a10e0e'], ['Orange', '#e8590c'], ['Green', '#2f8a1f'],
  ['Blue', '#1a5fb4'], ['Plum', '#3d1e6d'], ['Pink', '#c2185b'], ['Grey', '#6b6b6b'], ['White', '#ffffff'],
];
const HIGHLIGHTS: [string, string][] = [
  ['Yellow', '#fff200'], ['Light green', '#c8f59a'], ['Pink', '#ffc2e2'], ['Light blue', '#bde0fe'], ['Orange', '#ffd8a8'], ['Grey', '#e5e5e5'],
];
const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36];

/** The words the link box is about, shown highlighted while the box has the focus. */
const TARGET_HIGHLIGHT = 'fm-link-target';

type Menu = 'colour' | 'highlight' | 'size' | null;

/** The selection when last seen in the editor: as a Range, and as marks in case the HTML changes. */
interface Saved { range: Range; marks: Marks | null }

/** What the link box will change: a link, words already written, or new words at the cursor. */
type LinkTarget =
  | { kind: 'edit'; link: HTMLAnchorElement }
  | { kind: 'words'; marks: Marks; text: string }
  | { kind: 'insert'; range: Range; marks: Marks | null };

interface LinkBox { mode: LinkTarget['kind']; text: string; href: string; error: string | null }

const sameWords = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

export default function RichTextEditor({ value, onChange, kind, label }: {
  value: string;
  onChange: (value: string) => void;
  /** A heading is shown as it's emailed: bold, centred, in plum. */
  kind: 'heading' | 'text';
  /** For screen readers. */
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  // The value this editor last sent up, so its own typing isn't written back over it.
  const lastSent = useRef<string | null>(null);
  const saved = useRef<Saved | null>(null);
  // The last words selected, for a cursor left in them (on an iPhone, a tap
  // on the selected words is how its copy/paste bar is put away).
  const lastWords = useRef<{ marks: Marks; text: string; at: number } | null>(null);
  // From a finger or mouse going down on a button until its click is done,
  // the selection seen then is the one that counts (and while a menu or the
  // link box is open, the one seen when it opened).
  const holding = useRef(false);
  const target = useRef<LinkTarget | null>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const hrefInput = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [linkBox, setLinkBox] = useState<LinkBox | null>(null);
  const open = useRef({ menu: false, link: false });
  open.current = { menu: menu !== null, link: linkBox !== null };
  const [active, setActive] = useState({ bold: false, italic: false, underline: false, link: false });

  // A value from outside (a blast loaded, a venue's text filled in): show it.
  useEffect(() => {
    const el = ref.current;
    if (!el || value === lastSent.current) return;
    el.innerHTML = toEditorHtml(value, kind);
    lastSent.current = value;
  }, [value, kind]);

  const send = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = fromEditorHtml(el.innerHTML, el.textContent ?? '');
    lastSent.current = next;
    onChange(next);
  }, [onChange]);

  /** Keeps the selection if it's in this editor; false if it isn't. */
  const remember = useCallback(() => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.rangeCount) return false;
    const r = sel.getRangeAt(0);
    if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return false;
    const marks = marksOf(el, r);
    saved.current = { range: r.cloneRange(), marks };
    if (!r.collapsed && marks && r.toString().trim()) lastWords.current = { marks, text: r.toString(), at: Date.now() };
    return true;
  }, []);

  // Remember the selection while it's in this editor, and which styles it has.
  useEffect(() => {
    const onSelection = () => {
      if (holding.current || open.current.menu || open.current.link || !remember()) return;
      const el = ref.current;
      setActive({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        link: !!(el && saved.current && linkAround(el, saved.current.range)),
      });
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, [remember]);

  /** The remembered selection, found again if the HTML was rewritten since. */
  const selection = (): Range | null => {
    const el = ref.current;
    const s = saved.current;
    if (!el || !s) return null;
    if (stillIn(el, s.range)) return s.range.cloneRange();
    return s.marks ? rangeAt(el, s.marks) : null;
  };

  const restore = () => {
    const el = ref.current;
    if (!el) return;
    const r = selection();
    el.focus({ preventScroll: true });
    if (r) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
  };

  const run = (command: string, arg?: string) => {
    restore();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false, arg);
    // A link coloured along with the words around it shows in that colour in the email too.
    if (ref.current) settleLinkColours(ref.current);
    setMenu(null);
    send();
  };

  const setSize = (px: number) => {
    restore();
    // The browser's own sizes are 1 to 7: mark the selection with 7, then
    // replace the mark with the size in pixels.
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand('fontSize', false, '7');
    ref.current?.querySelectorAll('font[size="7"]').forEach((f) => {
      const span = document.createElement('span');
      span.style.fontSize = `${px}px`;
      while (f.firstChild) span.appendChild(f.firstChild);
      f.replaceWith(span);
    });
    ref.current?.querySelectorAll<HTMLElement>('[style*="xxx-large"]').forEach((s) => { s.style.fontSize = `${px}px`; });
    setMenu(null);
    send();
  };

  // ---- links

  const showTarget = (range: Range | null) => {
    try {
      if (range && typeof Highlight !== 'undefined' && CSS.highlights) CSS.highlights.set(TARGET_HIGHLIGHT, new Highlight(range));
    } catch { /* an older browser: the box shows the words anyway */ }
  };
  const hideTarget = () => {
    try { CSS.highlights?.delete(TARGET_HIGHLIGHT); } catch { /* as above */ }
  };

  const closeLinkBox = () => {
    target.current = null;
    open.current.link = false;
    setLinkBox(null);
    hideTarget();
  };

  /**
   * "Link": a box for the address, about the link the cursor is in (to
   * change or remove it), the words selected, the word the cursor is in, or
   * else new words at the cursor.
   */
  const openLinkBox = () => {
    const el = ref.current;
    if (!el) return;
    // Pressed again: closed.
    if (open.current.link) { closeLinkBox(); return; }
    setMenu(null);
    let r = selection();
    if (!r) {
      r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
    }
    let box: Omit<LinkBox, 'error'>;
    let shown: Range | null = null;
    const link = linkAround(el, r);
    if (link) {
      target.current = { kind: 'edit', link };
      box = { mode: 'edit', text: link.textContent ?? '', href: linkHrefForDisplay(link.getAttribute('href')) };
      shown = document.createRange();
      shown.selectNodeContents(link);
    } else {
      let words: Range | null = !r.collapsed && r.toString().trim() ? r : null;
      const recent = lastWords.current;
      const at = r.collapsed ? marksOf(el, r) : null;
      if (!words && recent && at && Date.now() - recent.at < 120_000 && at.start >= recent.marks.start && at.start <= recent.marks.end) {
        const back = rangeAt(el, recent.marks);
        if (back.toString() === recent.text) words = back;
      }
      words ??= wordAround(r);
      const marks = words ? marksOf(el, words) : null;
      if (words && marks) {
        target.current = { kind: 'words', marks, text: words.toString() };
        box = { mode: 'words', text: words.toString().replace(/\s+/g, ' ').trim(), href: '' };
        shown = words;
      } else {
        target.current = { kind: 'insert', range: r, marks: marksOf(el, r) };
        box = { mode: 'insert', text: '', href: '' };
      }
    }
    // Its first box takes the focus as it appears (autoFocus), while this
    // tap is still being handled: an iPhone only opens its keyboard then.
    open.current.link = true;
    setLinkBox({ ...box, error: null });
    showTarget(shown);
  };

  /** The cursor just after a link that was made or changed, ready to carry on typing. */
  const caretAfter = (a: HTMLAnchorElement) => {
    const el = ref.current;
    if (!el || !a.isConnected) return;
    el.focus({ preventScroll: true });
    const r = document.createRange();
    r.setStartAfter(a);
    r.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  };

  const applyLink = () => {
    const el = ref.current;
    const t = target.current;
    if (!el || !t || !linkBox) return;
    const href = linkHref(linkBox.href);
    if (!href) {
      setLinkBox({ ...linkBox, error: linkBox.href.trim() ? 'That isn’t a web address or an email address. Try something like fastmatch.com.au/register.' : 'Please enter the web address or email address to link to.' });
      hrefInput.current?.focus();
      return;
    }
    const text = linkBox.text.replace(/\s+/g, ' ').trim();
    let made: HTMLAnchorElement | null = null;
    if (t.kind === 'edit') {
      if (t.link.isConnected) {
        t.link.setAttribute('href', href);
        if (text && !sameWords(text, t.link.textContent ?? '')) t.link.textContent = text;
        made = t.link;
      }
    } else if (t.kind === 'words') {
      // The words as they were (keeping their bold or colour), or, if the
      // text was changed in the box, the new words in their place.
      made = !text || sameWords(text, t.text) ? wrapInLink(el, t.marks, href) : insertLink(el, rangeAt(el, t.marks), href, text);
    } else {
      const r = stillIn(el, t.range) ? t.range : t.marks ? rangeAt(el, t.marks) : null;
      if (r) {
        made = insertLink(el, r, href, text || linkHrefForDisplay(href));
        spaceAround(el, made);
      }
    }
    settleLinkColours(el);
    closeLinkBox();
    send();
    if (made) caretAfter(made);
  };

  const removeLinkInBox = () => {
    const t = target.current;
    if (t?.kind === 'edit' && t.link.isConnected) {
      unwrapLink(t.link);
      send();
    }
    closeLinkBox();
  };

  /** "Remove link": the links the selection touches, or the one the cursor is in. */
  const removeLinks = () => {
    const el = ref.current;
    const r = selection();
    setMenu(null);
    if (!el || !r) return;
    const links = linksIn(el, r);
    links.forEach(unwrapLink);
    if (links.length) {
      setActive((a) => ({ ...a, link: false }));
      send();
    }
  };

  // A menu or the link box closes when something else on the page is
  // pressed (a click, so scrolling past doesn't close it).
  useEffect(() => {
    if (!menu && !linkBox) return;
    const onClick = (e: MouseEvent) => {
      if (wrap.current?.contains(e.target as Node)) return;
      setMenu(null);
      if (open.current.link) closeLinkBox();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, linkBox]);

  // A button is going down: what's selected now is what it acts on.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTool = () => {
    if (!open.current.menu) remember();
    holding.current = true;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => { holding.current = false; }, 3000);
  };
  const endTool = () => {
    setTimeout(() => { holding.current = false; }, 0);
  };

  // Finger-sized on a phone, smaller from tablet size up.
  const tool = 'inline-flex h-10 min-w-10 touch-manipulation select-none items-center justify-center rounded-md px-2.5 text-sm text-ink hover:bg-plum/10 sm:h-8 sm:min-w-8 sm:px-2';
  const on = 'bg-plum/15 text-plum';
  // Not on a phone, where the buttons wrap onto several rows and a divider can start one.
  const divider = 'mx-1 hidden h-5 w-px bg-ink/10 sm:inline-block';
  // Pressing a tool mustn't take the focus (and the selection) out of the text.
  const keep = (e: React.MouseEvent | React.PointerEvent) => e.preventDefault();
  const boxInput = 'w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-base text-ink outline-none focus:border-plum sm:py-2 sm:text-sm';
  const boxButton = 'inline-flex min-h-11 touch-manipulation select-none items-center justify-center rounded-lg px-4 text-sm font-bold sm:min-h-9';

  const onBoxKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Not the blast form's own Enter (it would save the blast).
    if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
    if (e.key === 'Escape') { e.preventDefault(); closeLinkBox(); }
  };

  return (
    <div ref={wrap} className="rounded-lg border border-ink/15 bg-white focus-within:border-plum">
      <div
        role="toolbar"
        aria-label={`Formatting for ${label}`}
        className="relative flex select-none flex-wrap items-center gap-0.5 border-b border-ink/10 px-1.5 py-1"
        onPointerDownCapture={startTool}
        onClickCapture={endTool}
        onPointerCancelCapture={endTool}
      >
        <button type="button" onMouseDown={keep} onClick={() => run('bold')} className={`${tool} font-bold ${active.bold ? on : ''}`} title="Bold" aria-pressed={active.bold}>B</button>
        <button type="button" onMouseDown={keep} onClick={() => run('italic')} className={`${tool} italic ${active.italic ? on : ''}`} title="Italic" aria-pressed={active.italic}>I</button>
        <button type="button" onMouseDown={keep} onClick={() => run('underline')} className={`${tool} underline ${active.underline ? on : ''}`} title="Underline" aria-pressed={active.underline}>U</button>
        <span className={divider} aria-hidden="true" />
        {/* Near the start, so on a phone it's in the top row, out from under
            the copy/paste bar an iPhone shows above the selected words. */}
        <button type="button" onMouseDown={keep} onClick={openLinkBox} className={`${tool} ${active.link || linkBox ? on : ''}`}
          title={active.link ? 'Change or remove this link' : 'Make the selected words a link (or add a new link)'} aria-expanded={linkBox !== null}>
          <span className="text-xs font-bold underline">{active.link ? 'Edit link' : 'Link'}</span>
        </button>
        <span className={divider} aria-hidden="true" />
        <button type="button" onMouseDown={keep} onClick={() => setMenu(menu === 'colour' ? null : 'colour')} className={tool} title="Text colour" aria-expanded={menu === 'colour'}>
          <span className="font-bold" style={{ borderBottom: '3px solid #e2231a', lineHeight: 1 }}>A</span><span className="ml-1 text-xs">Colour</span>
        </button>
        <button type="button" onMouseDown={keep} onClick={() => setMenu(menu === 'highlight' ? null : 'highlight')} className={tool} title="Highlight" aria-expanded={menu === 'highlight'}>
          <span className="px-0.5 font-bold" style={{ backgroundColor: '#fff200', lineHeight: 1.2 }}>A</span><span className="ml-1 text-xs">Highlight</span>
        </button>
        <button type="button" onMouseDown={keep} onClick={() => setMenu(menu === 'size' ? null : 'size')} className={tool} title="Text size" aria-expanded={menu === 'size'}>
          <span className="text-xs">Size ▾</span>
        </button>
        <span className={divider} aria-hidden="true" />
        <button type="button" onMouseDown={keep} onClick={removeLinks} className={tool} title="Remove the link the cursor is in, or from the selected words"><span className="text-xs">Remove link</span></button>
        <button type="button" onMouseDown={keep} onClick={() => run('removeFormat')} className={tool} title="Clear the formatting of the selected text"><span className="text-xs">Clear formatting</span></button>

        {menu === 'colour' && (
          <Swatches label="Text colour" colours={COLOURS} onPick={(c) => run('foreColor', c)} />
        )}
        {menu === 'highlight' && (
          <Swatches label="Highlight" colours={HIGHLIGHTS} onPick={(c) => run('hiliteColor', c)} onNone={() => run('hiliteColor', 'transparent')} />
        )}
        {menu === 'size' && (
          <div className="absolute left-1 top-full z-10 mt-1 flex max-w-[calc(100vw-48px)] flex-wrap gap-1 rounded-lg border border-ink/10 bg-white p-2 shadow-lg" role="menu" aria-label="Text size">
            {SIZES.map((px) => (
              <button key={px} type="button" role="menuitem" onMouseDown={keep} onClick={() => setSize(px)}
                className="min-h-10 min-w-10 touch-manipulation rounded-md px-2 text-sm text-ink hover:bg-plum/10 sm:min-h-0 sm:min-w-0 sm:py-1">{px}</button>
            ))}
          </div>
        )}
      </div>

      {linkBox && (
        <div role="group" aria-label={linkBox.mode === 'edit' ? 'Change link' : 'Add a link'} className="border-b border-ink/10 bg-plum/[0.04] px-3 py-3">
          {linkBox.mode === 'insert' && (
            <p className="mb-2 text-xs text-ink/60">Adds new words as a link where the cursor is (left empty, the address is shown). To link words already written, select them, or put the cursor in a word, first.</p>
          )}
          <label className="mb-2 block">
            <span className="mb-1 block text-xs font-bold text-ink">Text to show</span>
            <input ref={textInput} autoFocus={linkBox.mode === 'insert'} value={linkBox.text} onChange={(e) => setLinkBox({ ...linkBox, text: e.target.value })} onKeyDown={onBoxKey}
              placeholder={linkBox.mode === 'insert' ? 'e.g. Register here' : ''} className={boxInput} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink">Link to</span>
            <input ref={hrefInput} autoFocus={linkBox.mode !== 'insert'} value={linkBox.href} onChange={(e) => setLinkBox({ ...linkBox, href: e.target.value, error: null })} onKeyDown={onBoxKey}
              type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" autoComplete="off"
              placeholder="e.g. fastmatch.com.au/register" aria-invalid={!!linkBox.error} className={boxInput} />
          </label>
          {linkBox.error
            ? <p role="alert" className="mt-1 text-xs font-medium text-coral">{linkBox.error}</p>
            : <p className="mt-1 text-xs text-ink/50">A web address or an email address.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={applyLink} className={`${boxButton} bg-coral text-white hover:bg-coral/90`}>{linkBox.mode === 'edit' ? 'Save link' : 'Add link'}</button>
            {linkBox.mode === 'edit' && (
              <button type="button" onClick={removeLinkInBox} className={`${boxButton} border border-coral text-coral hover:bg-coral/5`}>Remove link</button>
            )}
            <button type="button" onClick={closeLinkBox} className={`${boxButton} border border-plum text-plum hover:bg-plum/5`}>Cancel</button>
          </div>
        </div>
      )}

      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        contentEditable
        suppressContentEditableWarning
        onFocus={() => {
          document.execCommand('defaultParagraphSeparator', false, kind === 'heading' ? 'div' : 'p');
          // Back in the text: done with the link box.
          if (open.current.link) closeLinkBox();
        }}
        onInput={send}
        // A tap in the text puts away an open menu (the link box goes when the text gets the focus).
        onPointerDown={() => { if (open.current.menu) setMenu(null); }}
        onBlur={(e) => {
          // Free text: every line a paragraph, as the email spaces them (done
          // on leaving the box, so the cursor isn't moved while typing). Not
          // while a button or the link box has the focus: the words they act
          // on mustn't move.
          const el = ref.current;
          if (kind !== 'text' || !el || open.current.link || wrap.current?.contains(e.relatedTarget as Node | null)) return;
          const tidy = wrapLooseLines(el.innerHTML);
          if (tidy !== el.innerHTML) { el.innerHTML = tidy; send(); }
        }}
        onPaste={(e) => {
          // Plain text only: formatting pasted from elsewhere wouldn't survive anyway.
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
          send();
        }}
        className={`max-h-[420px] overflow-y-auto px-3.5 py-2.5 text-base outline-none sm:text-sm [&_a]:text-plum [&_a]:underline ${
          kind === 'heading'
            ? 'min-h-[64px] text-center !text-[20px] font-bold leading-snug text-plum'
            : 'min-h-[120px] leading-relaxed text-ink [&_p]:mb-3'
        }`}
      />
    </div>
  );
}

function Swatches({ label, colours, onPick, onNone }: { label: string; colours: [string, string][]; onPick: (colour: string) => void; onNone?: () => void }) {
  return (
    <div className="absolute left-1 top-full z-10 mt-1 w-[260px] max-w-[calc(100vw-48px)] rounded-lg border border-ink/10 bg-white p-2 shadow-lg" role="menu" aria-label={label}>
      <div className="flex flex-wrap gap-1.5">
        {colours.map(([name, c]) => (
          <button key={c} type="button" role="menuitem" title={name} aria-label={name} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(c)}
            className="h-9 w-9 touch-manipulation rounded-md border border-ink/20 sm:h-7 sm:w-7" style={{ backgroundColor: c }} />
        ))}
      </div>
      {onNone && (
        <button type="button" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={onNone} className="mt-2 min-h-10 touch-manipulation text-xs font-bold text-plum underline sm:min-h-0">No highlight</button>
      )}
    </div>
  );
}
