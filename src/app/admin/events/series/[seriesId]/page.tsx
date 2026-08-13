'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Badge } from '@/components/ui';

interface SeriesEvent {
  id: string; number: number; name: string; startsAt: string; visibility: string; status: string;
  _count: { bookings: number };
}

export default function SeriesPage() {
  const { seriesId } = useParams<{ seriesId: string }>();
  const router = useRouter();
  const [events, setEvents] = useState<SeriesEvent[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<string | null>(null);

  function load() {
    fetch(`/api/admin/events/series/${seriesId}`).then((r) => r.json()).then(setEvents);
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
      setResult(`${data.deleted} deleted, ${data.cancelled} cancelled (had existing bookings).`);
    } else {
      setResult(`${data.updated} event(s) updated.`);
    }
    setChecked(new Set());
    load();
  }

  const allChecked = events.length > 0 && checked.size === events.length;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Event series</h1>
      <p className="mb-6 text-sm text-ink/60">
        Select the events you want, then apply an action to just those — not the whole series. Deleting is fully
        reversible in effect: events with no bookings are removed, events with bookings are cancelled instead so
        anyone who's already paid is protected.
      </p>

      <div className="mb-3 flex items-center gap-2">
        <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} />
        <span className="text-sm font-bold text-ink">Select all ({checked.size} selected)</span>
      </div>

      <div className="mb-4 overflow-hidden rounded-xl border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-left text-xs font-bold uppercase text-ink/50">
            <tr><th className="w-10 px-4 py-3"></th><th className="px-4 py-3">#</th><th className="px-4 py-3">Start</th><th className="px-4 py-3">Bookings</th><th className="px-4 py-3">Status</th></tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-t border-ink/5">
                <td className="px-4 py-3"><input type="checkbox" checked={checked.has(e.id)} onChange={() => toggle(e.id)} /></td>
                <td className="px-4 py-3 text-ink/40">#{e.number}</td>
                <td className="px-4 py-3">{new Date(e.startsAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}, {new Date(e.startsAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}</td>
                <td className="px-4 py-3">{e._count.bookings}</td>
                <td className="px-4 py-3"><Badge tone={e.visibility === 'PUBLIC' ? 'green' : 'muted'}>{e.visibility === 'PUBLIC' ? 'Public' : 'Not public'}</Badge></td>
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

      {result && <p className="mt-4 text-sm font-bold text-green-dark">{result}</p>}

      <Button variant="ghost" onClick={() => router.push('/admin/events')} className="mt-6 w-full">Back to events</Button>
    </div>
  );
}
