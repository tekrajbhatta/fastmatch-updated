'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { escapeHtml } from '@/lib/escapeHtml';
import { toEditorHtml, fromEditorHtml, wrapLooseLines } from '@/lib/richText';

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
 */

const COLOURS: [string, string][] = [
  ['Black', '#1f1a24'], ['Red', '#e2231a'], ['Dark red', '#a10e0e'], ['Orange', '#e8590c'], ['Green', '#2f8a1f'],
  ['Blue', '#1a5fb4'], ['Plum', '#3d1e6d'], ['Pink', '#c2185b'], ['Grey', '#6b6b6b'], ['White', '#ffffff'],
];
const HIGHLIGHTS: [string, string][] = [
  ['Yellow', '#fff200'], ['Light green', '#c8f59a'], ['Pink', '#ffc2e2'], ['Light blue', '#bde0fe'], ['Orange', '#ffd8a8'], ['Grey', '#e5e5e5'],
];
const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36];

type Menu = 'colour' | 'highlight' | 'size' | null;

export default function RichTextEditor({ value, onChange, kind, label }: {
  value: string;
  onChange: (value: string) => void;
  /** A heading is shown as it's emailed: bold, centred, in plum. */
  kind: 'heading' | 'text';
  /** For screen readers. */
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The value this editor last sent up, so its own typing isn't written back over it.
  const lastSent = useRef<string | null>(null);
  // Where the selection was, for the menus (picking from one moves the focus).
  const range = useRef<Range | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [active, setActive] = useState({ bold: false, italic: false, underline: false });

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

  // Remember the selection while it's in this editor, and which styles it has.
  useEffect(() => {
    const onSelection = () => {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || !ref.current?.contains(sel.anchorNode)) return;
      range.current = sel.getRangeAt(0).cloneRange();
      setActive({ bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'), underline: document.queryCommandState('underline') });
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, []);

  const restore = () => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (range.current) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range.current);
    }
  };

  const run = (command: string, arg?: string) => {
    restore();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false, arg);
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
    ref.current?.querySelectorAll<HTMLElement>('span[style*="xxx-large"]').forEach((s) => { s.style.fontSize = `${px}px`; });
    setMenu(null);
    send();
  };

  const addLink = () => {
    const raw = window.prompt('Link to (a web address, e.g. https://fastmatch.com.au/register, or an email address):');
    if (!raw?.trim()) return;
    const typed = raw.trim();
    const url = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed) ? `mailto:${typed}`
      : /^(https?:\/\/|mailto:)/i.test(typed) ? typed : `https://${typed}`;
    restore();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      // Nothing selected: the address itself becomes the link.
      document.execCommand('insertHTML', false, `<a href="${escapeHtml(url)}">${escapeHtml(typed)}</a>`);
    } else {
      document.execCommand('createLink', false, url);
    }
    send();
  };

  const tool = 'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm text-ink hover:bg-plum/10';
  const on = 'bg-plum/15 text-plum';
  // Pressing a tool mustn't take the focus (and the selection) out of the text.
  const keep = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="rounded-lg border border-ink/15 bg-white focus-within:border-plum">
      <div role="toolbar" aria-label={`Formatting for ${label}`} className="relative flex flex-wrap items-center gap-0.5 border-b border-ink/10 px-1.5 py-1">
        <button type="button" onMouseDown={keep} onClick={() => run('bold')} className={`${tool} font-bold ${active.bold ? on : ''}`} title="Bold" aria-pressed={active.bold}>B</button>
        <button type="button" onMouseDown={keep} onClick={() => run('italic')} className={`${tool} italic ${active.italic ? on : ''}`} title="Italic" aria-pressed={active.italic}>I</button>
        <button type="button" onMouseDown={keep} onClick={() => run('underline')} className={`${tool} underline ${active.underline ? on : ''}`} title="Underline" aria-pressed={active.underline}>U</button>
        <span className="mx-1 h-5 w-px bg-ink/10" aria-hidden="true" />
        <button type="button" onMouseDown={keep} onClick={() => setMenu(menu === 'colour' ? null : 'colour')} className={tool} title="Text colour" aria-expanded={menu === 'colour'}>
          <span className="font-bold" style={{ borderBottom: '3px solid #e2231a', lineHeight: 1 }}>A</span><span className="ml-1 text-xs">Colour</span>
        </button>
        <button type="button" onMouseDown={keep} onClick={() => setMenu(menu === 'highlight' ? null : 'highlight')} className={tool} title="Highlight" aria-expanded={menu === 'highlight'}>
          <span className="px-0.5 font-bold" style={{ backgroundColor: '#fff200', lineHeight: 1.2 }}>A</span><span className="ml-1 text-xs">Highlight</span>
        </button>
        <button type="button" onMouseDown={keep} onClick={() => setMenu(menu === 'size' ? null : 'size')} className={tool} title="Text size" aria-expanded={menu === 'size'}>
          <span className="text-xs">Size ▾</span>
        </button>
        <span className="mx-1 h-5 w-px bg-ink/10" aria-hidden="true" />
        <button type="button" onMouseDown={keep} onClick={addLink} className={tool} title="Make the selected text a link"><span className="text-xs underline">Link</span></button>
        <button type="button" onMouseDown={keep} onClick={() => run('unlink')} className={tool} title="Remove the link from the selected text"><span className="text-xs">Remove link</span></button>
        <button type="button" onMouseDown={keep} onClick={() => run('removeFormat')} className={tool} title="Clear the formatting of the selected text"><span className="text-xs">Clear formatting</span></button>

        {menu === 'colour' && (
          <Swatches label="Text colour" colours={COLOURS} onPick={(c) => run('foreColor', c)} />
        )}
        {menu === 'highlight' && (
          <Swatches label="Highlight" colours={HIGHLIGHTS} onPick={(c) => run('hiliteColor', c)} onNone={() => run('hiliteColor', 'transparent')} />
        )}
        {menu === 'size' && (
          <div className="absolute left-1 top-full z-10 mt-1 flex flex-wrap gap-1 rounded-lg border border-ink/10 bg-white p-2 shadow-lg" role="menu" aria-label="Text size">
            {SIZES.map((px) => (
              <button key={px} type="button" role="menuitem" onMouseDown={keep} onClick={() => setSize(px)} className="rounded-md px-2 py-1 text-sm text-ink hover:bg-plum/10">{px}</button>
            ))}
          </div>
        )}
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        contentEditable
        suppressContentEditableWarning
        onFocus={() => document.execCommand('defaultParagraphSeparator', false, kind === 'heading' ? 'div' : 'p')}
        onInput={send}
        onBlur={() => {
          // Free text: every line a paragraph, as the email spaces them (done
          // on leaving the box, so the cursor isn't moved while typing).
          const el = ref.current;
          if (kind !== 'text' || !el) return;
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
    <div className="absolute left-1 top-full z-10 mt-1 w-[260px] rounded-lg border border-ink/10 bg-white p-2 shadow-lg" role="menu" aria-label={label}>
      <div className="flex flex-wrap gap-1.5">
        {colours.map(([name, c]) => (
          <button key={c} type="button" role="menuitem" title={name} aria-label={name} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(c)}
            className="h-7 w-7 rounded-md border border-ink/20" style={{ backgroundColor: c }} />
        ))}
      </div>
      {onNone && (
        <button type="button" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={onNone} className="mt-2 text-xs font-bold text-plum underline">No highlight</button>
      )}
    </div>
  );
}
