'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * A question or a short task in a box over the page (admin styling): "Delete
 * this venue?", "Confirm and send". It shows wherever the admin is on the
 * page, which a box drawn above a long list did not (it opened out of view).
 *
 * On a phone it rises from the bottom of the screen, where the thumb is; on
 * a computer it sits in the middle. Escape, or a tap outside the box, closes
 * it, unless `busy` (something is being saved): then it stays until done.
 * The page behind doesn't scroll while it's open, and focus moves into the
 * box and back to where it was afterwards.
 */
export default function Modal({
  title, onClose, busy = false, children, wide = false,
}: {
  title: ReactNode;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
  /** For a box with an email preview in it. */
  wide?: boolean;
}) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  // Read inside the listeners, so they always see the latest value.
  const state = useRef({ busy, onClose });
  state.current = { busy, onClose };

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // A box to type in, if there is one; otherwise the dialog itself, never a
    // button: a stray Enter must not answer "Yes, delete" or "Send".
    const first = boxRef.current?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea');
    (first ?? boxRef.current)?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !state.current.busy) state.current.onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 sm:items-center sm:p-4"
      onClick={() => { if (!state.current.busy) onClose(); }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl outline-none sm:rounded-2xl sm:p-6 ${wide ? 'sm:max-w-lg' : 'sm:max-w-md'}`}
      >
        <h2 id={titleId} className="mb-2 text-lg font-extrabold text-ink">{title}</h2>
        {children}
      </div>
    </div>
  );
}
