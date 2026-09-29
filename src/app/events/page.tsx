'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui';
import { venueLine } from '@/lib/venue';
import MemberEventsBrowser from '@/components/MemberEventsBrowser';
import { formatEventForViewer } from '@/lib/timezone';

interface EventListItem {
  id: string;
  name: string;
  venue: { name: string; address: string | null };
  startsAt: string;
  ageMin: number;
  ageMax: number;
  // No booked counts here on purpose. /api/events still returns them (the
  // admin screens need them), but members must not see how full an event is
  // — a half-empty night shouldn't talk anyone out of coming.
  bookedByMe: boolean;
  theme: { name: string };
  city: { name: string };
}

const THEME_TONES: Array<'green' | 'plum' | 'muted'> = ['green', 'plum', 'muted'];

export default function EventsPage() {
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/events').then((r) => r.json()),
      // Public endpoint — returns { member: null } when logged out rather than
      // failing, so this is safe for anonymous visitors.
      fetch('/api/auth/me').then((r) => r.json()).catch(() => ({ member: null })),
    ])
      .then(([eventData, meData]) => {
        setEvents(Array.isArray(eventData) ? eventData : []);
        if (meData?.member) setLoggedIn(true);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Upcoming Events</h1>
      <p className="mb-6 text-sm text-ink/60">Find a speed dating event near you.</p>

      {loading && <p className="text-sm text-ink/50">Loading events…</p>}
      {!loading && !loggedIn && events.length === 0 && (
        <p className="text-sm text-ink/50">No upcoming events right now — check back soon.</p>
      )}

      {/* Logged-out visitors get the plain list they always had. Members get
          the old site's layout: the events they're booked into, then a table
          of what's on in their city, booked events first. */}
      {!loading && !loggedIn && events.length > 0 && <EventGrid events={events} />}
      {!loading && loggedIn && <MemberEventsBrowser showBookedList />}
    </div>
  );
}

function EventGrid({ events }: { events: EventListItem[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {events.map((event, i) => {
        const when = formatEventForViewer(event.startsAt, event.city.name);

        return (
          <Link key={event.id} href={`/events/${event.id}`} className="block rounded-xl border border-ink/10 bg-white p-4 hover:border-green">
            <div className="flex items-start justify-between gap-2">
              <Badge tone={THEME_TONES[i % THEME_TONES.length]}>{event.theme.name}</Badge>
              {event.bookedByMe && <Badge tone="green">Booked</Badge>}
            </div>
            <h2 className="mt-2 font-extrabold text-ink">{event.name}</h2>
            <p className="mt-1 text-sm text-ink/60">
              {venueLine(event.venue)}, {event.city.name}
              <br />
              <strong className="text-ink">
                {when.shortDate}, {when.time}{when.note ? ` (${when.note})` : ''}
              </strong>
              <br />
              <span className="text-xs">Ages {event.ageMin}–{event.ageMax}</span>
            </p>
          </Link>
        );
      })}
    </div>
  );
}
