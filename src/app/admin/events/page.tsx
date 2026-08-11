'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, Badge } from '@/components/ui';

interface AdminEvent {
  id: string;
  number: number;
  name: string;
  venue: string;
  startsAt: string;
  visibility: 'PUBLIC' | 'NOT_PUBLIC';
  status: string;
  seriesId: string | null;
  theme: { name: string };
  city: { name: string };
  _count: { bookings: number };
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/events').then((r) => r.json()).then((data) => {
      setEvents(data);
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Events</h1>
          <p className="text-sm text-ink/60">Numbers assign automatically, starting at #1.</p>
        </div>
        <Link href="/admin/events/new"><Button>+ New event</Button></Link>
      </div>

      {loading && <p className="text-sm text-ink/50">Loading…</p>}

      <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-left text-xs font-bold uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Theme</th>
              <th className="px-4 py-3">Start</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Bookings</th>
              <th className="px-4 py-3">Visibility</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="cursor-pointer border-t border-ink/5 hover:bg-cream/30" onClick={() => (window.location.href = `/admin/events/${e.id}`)}>
                <td className="px-4 py-3 text-ink/40">#{e.number}</td>
                <td className="px-4 py-3 font-bold text-ink">
                  {e.name}
                  {e.seriesId && (
                    <Link href={`/admin/events/series/${e.seriesId}`} onClick={(ev) => ev.stopPropagation()} className="ml-2 rounded-full bg-plum/10 px-2 py-0.5 text-xs font-bold text-plum">
                      part of a series
                    </Link>
                  )}
                </td>
                <td className="px-4 py-3">{e.theme.name}</td>
                <td className="px-4 py-3">{new Date(e.startsAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}, {new Date(e.startsAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}</td>
                <td className="px-4 py-3">{e.city.name}</td>
                <td className="px-4 py-3">{e._count.bookings}</td>
                <td className="px-4 py-3"><Badge tone={e.visibility === 'PUBLIC' ? 'green' : 'muted'}>{e.visibility === 'PUBLIC' ? 'Public' : 'Not public'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
