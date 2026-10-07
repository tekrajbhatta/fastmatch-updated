'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Badge, Loader, BackLink } from '@/components/ui';
import EventWhen from '@/components/EventWhen';
import CancelSummary, { type CancelResult } from '@/components/CancelSummary';

interface SeriesEvent {
  id: string; number: number; name: string; startsAt: string; visibility: string; status: string;
  _count: { bookings: number }; city: { name: string };
}

export default function SeriesPage() {
  const { seriesId } = useParams<{ seriesId: string }>();
  const router = useRouter();
  const [events, setEvents] = useState<SeriesEvent[]>([]);
  // False until the first fetch returns, so the list doesn't claim to be empty while loading.
  const [loaded, setLoaded] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ text: string; warn: boolean } | null>(null);
  // "Delete selected" left these booked events as they are, and asks Gil
  // whether to cancel them instead (Q4).
  const [askCancel, setAskCancel] = useState<{ id: string; number: number }[] | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelResult, setCancelResult] = useState<CancelResult | null>(null);
  // "Delete selected" asks first: deleting can't be undone, and the button
  // sits next to "Make not public".
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function load() {
    fetch(`/api/admin/events/series/${seriesId}`).then((r) => r.json()).then((d) => { setEvents(d); setLoaded(true); });
  }
  useEffect(() => { load(); }, [seriesId]);

  function toggle(id: string) {
    const next = new Set(checked);
    next.has(id) ? next.delete(id) : next.add(id);
    setChecked(next);
  }
  function toggleAll(on: boolean) {
    setChecked(on ? new Set(events.map((e) => e.id)) : new Set());
  }

  async function runAction(action: 'DELETE' | 'SET_NOT_PUBLIC' | 'SET_PUBLIC') {
    setResult(null);
    setAskCancel(null);
    setCancelResult(null);
    const res = await fetch(`/api/admin/events/series/${seriesId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, eventIds: Array.from(checked) }),
    });
    const data = await res.json();
    if (action === 'DELETE') {
      setResult(deleteMessage(data.deleted, data.withBookings?.length ?? 0, data.leftAlone ?? []));
      if (data.withBookings?.length) setAskCancel(data.withBookings);
    } else {
      setResult({ text: `${data.updated} event(s) updated.`, warn: false });
    }
    setChecked(new Set());
    load();
  }

  // YES: each is cancelled as from its own page: everyone booked is emailed
  // and texted, and card payments are refunded.
  async function cancelBooked() {
    if (!askCancel) return;
    setCancelling(true);
    const res = await fetch(`/api/admin/events/series/${seriesId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'CANCEL', eventIds: askCancel.map((e) => e.id) }),
    });
    const data = await res.json().catch(() => ({}));
    setCancelling(false);
    setAskCancel(null);
    if (!res.ok) { setResult({ text: typeof data.error === 'string' ? data.error : 'Could not cancel them.', warn: true }); return; }
    setResult(null);
    setCancelResult(data);
    load();
  }

  // NO: left exactly as they are.
  function keepBooked() {
    const n = askCancel?.length ?? 0;
    setAskCancel(null);
    setResult({ text: `${n === 1 ? 'The event with bookings was' : `The ${n} events with bookings were`} left as ${n === 1 ? 'it was' : 'they were'}.`, warn: false });
  }

  const allChecked = events.length > 0 && checked.size === events.length;

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/admin/events">Back to events</BackLink>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Event series</h1>
      <p className="mb-6 text-sm text-ink/60">
        Select the events you want, then apply an action to just those, not the whole series. Deleting can&apos;t be
        undone: events with no bookings are removed for good. An event with bookings can&apos;t be deleted: you&apos;re asked
        whether to cancel it instead, which emails and texts the people booked and refunds card payments. Making an
        event not public only hides it: its bookings stay and nobody is told.
      </p>

      <div className="mb-3 flex items-center gap-2">
        <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} />
        <span className="text-sm font-bold text-ink">Select all ({checked.size} selected)</span>
      </div>

      {/* Scrolls sideways on a phone rather than cutting off the Status column. */}
      <div className="mb-4 overflow-x-auto rounded-xl border border-ink/10 bg-white">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="bg-cream/50 text-left text-xs font-bold uppercase text-ink/50">
            <tr><th className="w-10 px-4 py-3"></th><th className="px-4 py-3">#</th><th className="px-4 py-3">Start</th><th className="px-4 py-3">Bookings</th><th className="px-4 py-3">Status</th></tr>
          </thead>
          <tbody>
            {!loaded && <tr><td colSpan={5}><Loader label="Loading the series…" /></td></tr>}
            {events.map((e) => (
              <tr key={e.id} className="border-t border-ink/5">
                <td className="px-4 py-3"><input type="checkbox" checked={checked.has(e.id)} onChange={() => toggle(e.id)} /></td>
                <td className="px-4 py-3 text-ink/40">#{e.number}</td>
                <td className="px-4 py-3"><EventWhen startsAt={e.startsAt} city={e.city?.name} /></td>
                <td className="px-4 py-3">{e._count.bookings}</td>
                <td className="px-4 py-3">
                  {/* A booked event that "Delete selected" cancelled says so,
                      rather than still reading Public. */}
                  {e.status === 'CANCELLED'
                    ? <Badge tone="muted">Cancelled</Badge>
                    : <Badge tone={e.visibility === 'PUBLIC' ? 'green' : 'muted'}>{e.visibility === 'PUBLIC' ? 'Public' : 'Not public'}</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" disabled={!checked.size} onClick={() => runAction('SET_NOT_PUBLIC')}>Make not public</Button>
        <Button variant="ghost" disabled={!checked.size} onClick={() => runAction('SET_PUBLIC')}>Make public</Button>
        <Button variant="danger" disabled={!checked.size} onClick={() => { setResult(null); setConfirmingDelete(true); }}>Delete selected</Button>
      </div>

      {confirmingDelete && checked.size > 0 && (() => {
        const chosen = events.filter((e) => checked.has(e.id));
        const unbooked = chosen.filter((e) => e._count.bookings === 0);
        const booked = chosen.length - unbooked.length;
        return (
          <div className="mt-3 rounded-lg bg-coral/10 p-3 text-sm text-ink">
            <p className="mb-2 font-bold">
              Delete {chosen.length === 1 ? 'the selected event' : `the ${chosen.length} selected events`} ({chosen.map((e) => `#${e.number}`).join(', ')})?
            </p>
            <ul className="mb-3 list-inside list-disc space-y-1">
              {unbooked.length > 0 && (
                <li>{unbooked.length === 1 ? '1 event nobody has booked is' : `${unbooked.length} events nobody has booked are`} deleted for good. This can&apos;t be undone.</li>
              )}
              {booked > 0 && (
                <li>{booked === 1 ? '1 event has' : `${booked} events have`} bookings, so {booked === 1 ? 'it isn’t' : 'they aren’t'} deleted: you&apos;ll be asked whether to cancel {booked === 1 ? 'it' : 'them'} instead.</li>
              )}
            </ul>
            <div className="flex gap-2">
              <Button variant="danger" onClick={() => { setConfirmingDelete(false); runAction('DELETE'); }}>Yes, delete</Button>
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>Keep them</Button>
            </div>
          </div>
        );
      })()}

      {result && <p role="status" className={`mt-4 text-sm font-bold ${result.warn ? 'text-coral' : 'text-green-dark'}`}>{result.text}</p>}
      {askCancel && (
        <div className="mt-3 rounded-lg bg-amber/15 p-3 text-sm text-ink">
          <p className="mb-3 font-bold">
            Do you want to cancel {askCancel.length === 1 ? 'the event' : `these ${askCancel.length} events`} ({askCancel.map((e) => `#${e.number}`).join(', ')}) and notify bookings and refund?
          </p>
          <div className="flex gap-2">
            <Button variant="danger" onClick={cancelBooked} disabled={cancelling} loading={cancelling}>{cancelling ? 'Cancelling…' : 'Yes'}</Button>
            <Button variant="ghost" onClick={keepBooked} disabled={cancelling}>No</Button>
          </div>
        </div>
      )}
      {cancelResult && <div role="status" className="mt-4 rounded-lg bg-cream/60 p-3"><CancelSummary result={cancelResult} /></div>}

      <Button variant="ghost" onClick={() => router.push('/admin/events')} className="mt-6 w-full">Back to events</Button>
    </div>
  );
}

// What "Delete selected" did, in plain words rather than "0 deleted". An
// event with bookings is never deleted: it's left as it is, and Gil is asked
// whether to cancel it instead (the question under this message).
function deleteMessage(deleted: number, withBookings: number, leftAlone: { number: number; reason: string }[]): { text: string; warn: boolean } {
  const parts: string[] = [];
  if (deleted > 0) parts.push(`${deleted} event${deleted === 1 ? '' : 's'} deleted.`);
  if (withBookings === 1) parts.push('Cannot delete an event with bookings.');
  else if (withBookings > 1) parts.push(`Cannot delete events with bookings (${withBookings} of them).`);
  for (const e of leftAlone) parts.push(`#${e.number} has bookings, so it can't be deleted. ${e.reason}`);
  return { text: parts.join(' ') || 'Nothing was deleted.', warn: withBookings > 0 || leftAlone.length > 0 };
}
