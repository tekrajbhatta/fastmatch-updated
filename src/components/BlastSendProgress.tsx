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
 *
 * `sentCount` is how far through the list the send has got; `failedCount` how
 * many of those a message didn't reach. Failures used to be counted as sent.
 */
export default function BlastSendProgress({
  status, sentCount, failedCount = 0, total, children,
}: {
  status: 'STARTING' | 'SENDING' | 'PAUSED' | 'SENT' | string;
  sentCount?: number;
  failedCount?: number;
  total: number;
  children?: ReactNode;
}) {
  const people = `${total.toLocaleString()} member${total === 1 ? '' : 's'}`;
  const failed = failedCount > 0 ? ` · ${failedCount.toLocaleString()} failed` : '';

  if (status === 'SENT') {
    const delivered = Math.max(0, (sentCount ?? total) - failedCount);
    return (
      <div role="status" className="mb-4 rounded-lg border border-green/40 bg-green/10 p-3 text-center text-sm">
        <div className="text-xl font-extrabold text-green-dark">{failedCount > 0 ? blastOutcome(delivered, failedCount) : `${sentCount} / ${total} sent`}</div>
        <div className="mb-2 text-ink/60">
          {failedCount > 0
            ? 'Done. Some messages couldn’t be sent (the server log has the details); everyone else has theirs.'
            : 'Blast delivered to everyone in the filtered list.'}
        </div>
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
        {starting ? `Sending to ${people}…` : `${sentCount ?? 0} / ${total}${failed}`}
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

/** "1,234 sent", or "1,230 sent, 4 failed": for the progress box and a blast's History. */
export function blastOutcome(sent: number, failed: number): string {
  return failed > 0 ? `${sent.toLocaleString()} sent, ${failed.toLocaleString()} failed` : `${sent.toLocaleString()} sent`;
}
