'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui';
import { venueLine } from '@/lib/venue';
import { calculateAge, suitsAge, AGE_SUGGESTION_MARGIN } from '@/lib/age';

interface EventListItem {
  id: string;
  name: string;
  venue: { name: string; address: string | null };
  startsAt: string;
  ageMin: number;
  ageMax: number;
  maxMen: number;
  maxWomen: number;
  menBooked: number;
  womenBooked: number;
  bookedByMe: boolean;
  theme: { name: string };
  city: { name: string };
}

const THEME_TONES: Array<'green' | 'plum' | 'muted'> = ['green', 'plum', 'muted'];

export default function EventsPage() {
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [age, setAge] = useState<number | null>(null);
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
        if (meData?.member) {
          setLoggedIn(true);
          setAge(calculateAge(new Date(meData.member.dateOfBirth)));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const booked = events.filter((e) => e.bookedByMe);
  const rest = events.filter((e) => !e.bookedByMe);
  // With no date of birth to go on, nothing is "suggested" — everything falls
  // through to the general list rather than being hidden.
  const suggested = age === null ? [] : rest.filter((e) => suitsAge(e, age));
  const others = age === null ? rest : rest.filter((e) => !suitsAge(e, age));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Upcoming events</h1>
      <p className="mb-6 text-sm text-ink/60">Find a speed dating event near you.</p>

      {loading && <p className="text-sm text-ink/50">Loading events…</p>}
      {!loading && events.length === 0 && (
        <p className="text-sm text-ink/50">No upcoming events right now — check back soon.</p>
      )}

      {/* Logged-out visitors get the plain list they always had. Members get
          the same events grouped: what they're going to, then what suits them,
          then everything else — so nothing is hidden either way. */}
      {!loading && !loggedIn && <EventGrid events={events} />}

      {!loading && loggedIn && (
        <>
          {booked.length > 0 && (
            <Section title="Events you have booked into" events={booked} highlight />
          )}
          {suggested.length > 0 && (
            <Section
              title="Other upcoming events you may be interested in"
              subtitle={age !== null ? `Matching your age (${age}), give or take ${AGE_SUGGESTION_MARGIN} years.` : undefined}
              events={suggested}
            />
          )}
          {others.length > 0 && (
            <Section title="All other upcoming events" events={others} />
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, subtitle, events, highlight = false }: { title: string; subtitle?: string; events: EventListItem[]; highlight?: boolean }) {
  // The booked section sits on a tinted, bordered panel so it reads as "yours"
  // at a glance rather than as just another heading in a long scroll.
  return (
    <section className={highlight ? 'mb-8 rounded-2xl border border-green/30 bg-green/5 p-4 sm:p-5' : 'mb-8'}>
      <h2 className="mb-1 text-lg font-extrabold text-ink">{title}</h2>
      {subtitle && <p className="mb-3 text-sm text-ink/50">{subtitle}</p>}
      <div className={subtitle ? '' : 'mt-3'}>
        <EventGrid events={events} />
      </div>
    </section>
  );
}

function EventGrid({ events }: { events: EventListItem[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {events.map((event, i) => {
        const totalCapacity = event.maxMen + event.maxWomen;
        const totalBooked = event.menBooked + event.womenBooked;
        const pct = Math.min(100, Math.round((totalBooked / totalCapacity) * 100));
        const date = new Date(event.startsAt);

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
                {date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })},{' '}
                {date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
              </strong>
              <br />
              <span className="text-xs">Ages {event.ageMin}–{event.ageMax}</span>
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
  );
}
