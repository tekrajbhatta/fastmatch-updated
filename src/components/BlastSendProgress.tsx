import type { ReactNode } from 'react';
import { ProgressBar, Spinner } from '@/components/Spinner';

/**
 * Where a blast send has got to, shown on both screens that send blasts (a
 * blast's Send tab, and "blast these filtered members").
 *
 *   STARTING — the send request is out. Up to 100 recipients go inside that
 *              one request, so there's no count to show yet: a moving bar.
 *   SENDING  — a longer list is carrying on in batches of 100: a filling bar.
 *   PAUSED   — the same bar, stopped.
 *   SENT     — done.
 *
 * `children` are the controls for an in-progress send (Pause/Resume/Cancel)
 * or a link to the blast's history.
 */
export default function BlastSendProgress({
  status, sentCount, total, children,
}: {
  status: 'STARTING' | 'SENDING' | 'PAUSED' | 'SENT' | string;
  sentCount?: number;
  total: number;
  children?: ReactNode;
}) {
  const people = `${total.toLocaleString()} member${total === 1 ? '' : 's'}`;

  if (status === 'SENT') {
    return (
      <div role="status" className="mb-4 rounded-lg border border-green/40 bg-green/10 p-3 text-center text-sm">
        <div className="text-xl font-extrabold text-green-dark">{sentCount} / {total} sent</div>
        <div className="mb-2 text-ink/60">Blast delivered to everyone in the filtered list.</div>
        <ProgressBar value={sentCount ?? total} max={Math.max(total, 1)} label="Blast sending progress" trackClassName="bg-green/20" barClassName="bg-green-dark" />
        {children && <div className="mt-2">{children}</div>}
      </div>
    );
  }

  const starting = status === 'STARTING';
  const paused = status === 'PAUSED';
  return (
    <div role="status" aria-live="polite" className="mb-4 rounded-lg bg-cream/50 p-3 text-center text-sm">
      <div className="mb-1 flex items-center justify-center gap-2 text-xl font-extrabold text-plum">
        {!paused && <Spinner className="h-5 w-5" />}
        {starting ? `Sending to ${people}…` : `${sentCount ?? 0} / ${total}`}
      </div>
      <div className="mb-3 text-ink/50">
        {starting
          ? 'Hold on, the blast is going out. Short lists finish in a few seconds; longer ones carry on in batches of 100.'
          : paused ? 'paused' : 'sending…'}
      </div>
      {starting ? (
        <ProgressBar label="Blast sending progress" />
      ) : (
        <ProgressBar value={sentCount ?? 0} max={Math.max(total, 1)} label="Blast sending progress" barClassName={paused ? 'bg-ink/30' : 'bg-plum'} />
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
