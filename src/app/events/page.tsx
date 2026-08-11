'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui';

interface EventListItem {
  id: string;
  name: string;
  venue: string;
  startsAt: string;
  maxMen: number;
  maxWomen: number;
  menBooked: number;
  womenBooked: number;
  theme: { name: string };
  city: { name: string };
}

const THEME_TONES: Array<'green' | 'plum' | 'muted'> = ['green', 'plum', 'muted'];

export default function EventsPage() {
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/events').then((r) => r.json()).then((data) => {
      setEvents(data);
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Upcoming events</h1>
      <p className="mb-6 text-sm text-ink/60">Find a speed dating event near you.</p>

      {loading && <p className="text-sm text-ink/50">Loading events…</p>}
      {!loading && events.length === 0 && <p className="text-sm text-ink/50">No upcoming events right now — check back soon.</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {events.map((event, i) => {
          const totalCapacity = event.maxMen + event.maxWomen;
          const totalBooked = event.menBooked + event.womenBooked;
          const pct = Math.min(100, Math.round((totalBooked / totalCapacity) * 100));
          const date = new Date(event.startsAt);

          return (
            <Link key={event.id} href={`/events/${event.id}`} className="block rounded-xl border border-ink/10 bg-white p-4 hover:border-green">
              <Badge tone={THEME_TONES[i % THEME_TONES.length]}>{event.theme.name}</Badge>
              <h2 className="mt-2 font-extrabold text-ink">{event.name}</h2>
              <p className="mt-1 text-sm text-ink/60">
                {event.venue}, {event.city.name}
                <br />
                <strong className="text-ink">
                  {date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })},{' '}
                  {date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
                </strong>
              </p>
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full bg-green" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-bold text-green-dark">{totalBooked} / {totalCapacity} booked</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
