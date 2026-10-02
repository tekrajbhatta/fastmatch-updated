'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Badge, Loader, BackLink } from '@/components/ui';

interface SeriesEvent {
  id: string; number: number; name: string; startsAt: string; visibility: string; status: string;
  _count: { bookings: number };
}

export default function SeriesPage() {
  const { seriesId } = useParams<{ seriesId: string }>();
  const router = useRouter();
  const [events, setEvents] = useState<SeriesEvent[]>([]);
  // False until the first fetch returns, so the list doesn't claim to be empty while loading.
  const [loaded, setLoaded] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ text: string; warn: boolean } | null>(null);

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
    const res = await fetch(`/api/admin/events/series/${seriesId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, eventIds: Array.from(checked) }),
    });
    const data = await res.json();
    if (action === 'DELETE') {
      setResult(deleteMessage(data.deleted, data.cancelled));
    } else {
      setResult({ text: `${data.updated} event(s) updated.`, warn: false });
    }
    setChecked(new Set());
    load();
  }

  const allChecked = events.length > 0 && checked.size === events.length;

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/admin/events">Back to events</BackLink>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Event series</h1>
      <p className="mb-6 text-sm text-ink/60">
        Select the events you want, then apply an action to just those, not the whole series. Deleting is fully
        reversible in effect: events with no bookings are removed, events with bookings are cancelled instead so
        anyone who's already paid is protected.
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
                <td className="px-4 py-3">{new Date(e.startsAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}, {new Date(e.startsAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}</td>
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
        <Button variant="danger" disabled={!checked.size} onClick={() => runAction('DELETE')}>Delete selected</Button>
      </div>

      {result && <p role="status" className={`mt-4 text-sm font-bold ${result.warn ? 'text-coral' : 'text-green-dark'}`}>{result.text}</p>}

      <Button variant="ghost" onClick={() => router.push('/admin/events')} className="mt-6 w-full">Back to events</Button>
    </div>
  );
}

// What "Delete selected" did. An event with bookings is never deleted: it is
// cancelled instead (hidden from the public and closed to bookings), and the
// message says so in plain words rather than "0 deleted, 1 cancelled".
function deleteMessage(deleted: number, cancelled: number): { text: string; warn: boolean } {
  const parts: string[] = [];
  if (deleted > 0) parts.push(`${deleted} event${deleted === 1 ? '' : 's'} deleted.`);
  if (cancelled === 1) {
    parts.push("Cannot delete an event with bookings, so it has been cancelled instead: it's hidden and can't be booked. Its attendees haven't been told.");
  } else if (cancelled > 1) {
    parts.push(`Cannot delete events with bookings, so ${cancelled} have been cancelled instead: they're hidden and can't be booked. Their attendees haven't been told.`);
  }
  return { text: parts.join(' ') || 'Nothing was deleted.', warn: cancelled > 0 };
}
