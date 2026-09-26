'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, Badge } from '@/components/ui';
import { eventPeriod, type EventPeriod } from '@/lib/eventWeek';

interface AdminEvent {
  id: string;
  number: number;
  name: string;
  venue: { name: string; address: string | null };
  startsAt: string;
  visibility: 'PUBLIC' | 'NOT_PUBLIC';
  status: string;
  seriesId: string | null;
  theme: { name: string };
  city: { name: string };
  _count: { bookings: number };
  menBooked: number;
  womenBooked: number;
  maxMen: number;
  maxWomen: number;
  // Already returned by GET /api/admin/events (findMany returns every scalar
  // column) — they were simply missing from this interface, so no API change
  // was needed to show the age range.
  ageMin: number;
  ageMax: number;
}

const PER_PAGE = 10;

/**
 * Row tint by how soon the event is. Past and far-off events stay white so
 * the two that need attention — this week and next — are the only things
 * that catch the eye. Brand amber and green at low opacity, so black text
 * stays perfectly legible on both.
 */
const ROW_TINT: Record<EventPeriod, string> = {
  past: 'hover:bg-cream/30',
  thisWeek: 'bg-amber/15 hover:bg-amber/25',
  nextWeek: 'bg-green/15 hover:bg-green/25',
  later: 'hover:bg-cream/30',
};

export default function AdminEventsPage() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch('/api/admin/events').then((r) => r.json()).then((data) => {
      setEvents(data);
      setLoading(false);
    });
  }, []);

  // One "now" for the whole render, so every row is bucketed against the same
  // instant rather than each against a slightly later one.
  const now = new Date();

  const pageCount = Math.max(1, Math.ceil(events.length / PER_PAGE));
  // Deleting the last event on the final page would otherwise strand the
  // viewer on an empty one.
  const currentPage = Math.min(page, pageCount);
  const visible = events.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Events</h1>
          <p className="text-sm text-ink/60">Numbers assign automatically, starting at #1.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/venues"><Button variant="ghost">Manage venues</Button></Link>
          <Link href="/admin/events/new"><Button>+ New event</Button></Link>
        </div>
      </div>

      {/* Without this the colours are a guessing game. */}
      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-ink/60">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-ink/15 bg-amber/25" /> On this week
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-ink/15 bg-green/25" /> On next week
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-ink/15 bg-white" /> Past, or further ahead
        </span>
      </div>

      {loading && <p className="text-sm text-ink/50">Loading…</p>}

      <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-left text-xs font-bold uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Date &amp; Time</th>
              <th className="px-4 py-3">Theme</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Venue</th>
              <th className="px-4 py-3">Ages</th>
              <th className="px-4 py-3">Men</th>
              <th className="px-4 py-3">Women</th>
              <th className="px-4 py-3">Visibility</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => (
              <tr
                key={e.id}
                className={`cursor-pointer border-t border-ink/5 ${ROW_TINT[eventPeriod(new Date(e.startsAt), now)]}`}
                onClick={() => (window.location.href = `/admin/events/${e.id}`)}
              >
                <td className="px-4 py-3 text-ink/40">#{e.number}</td>
                <td className="px-4 py-3 font-bold text-ink">
                  {e.name}
                  {e.seriesId && (
                    <Link href={`/admin/events/series/${e.seriesId}`} onClick={(ev) => ev.stopPropagation()} className="ml-2 rounded-full bg-plum/10 px-2 py-0.5 text-xs font-bold text-plum">
                      part of a series
                    </Link>
                  )}
                </td>
                {/* Cell order must mirror the <th> order above: Date & Time,
                    Theme, City, Venue, Ages, Men, Women, Visibility. */}
                <td className="whitespace-nowrap px-4 py-3">
                  {new Date(e.startsAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}, {new Date(e.startsAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
                </td>
                <td className="px-4 py-3">{e.theme.name}</td>
                <td className="px-4 py-3">{e.city.name}</td>
                {/* Name only — venueLine() would add the full street address
                    and make this column dominate the table. The address is on
                    the event's own page and in /admin/venues. */}
                <td className="px-4 py-3">{e.venue.name}</td>
                <td className="whitespace-nowrap px-4 py-3">{e.ageMin}–{e.ageMax}</td>
                <td className="px-4 py-3">{e.menBooked}/{e.maxMen}</td>
                <td className="px-4 py-3">{e.womenBooked}/{e.maxWomen}</td>
                <td className="px-4 py-3"><Badge tone={e.visibility === 'PUBLIC' ? 'green' : 'muted'}>{e.visibility === 'PUBLIC' ? 'Public' : 'Not public'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Hidden until there is a second page — a lone "Page 1 of 1" is just
          clutter on a short list. */}
      {pageCount > 1 && (
        <Pager page={currentPage} pageCount={pageCount} total={events.length} onChange={setPage} />
      )}
    </div>
  );
}

function Pager({ page, pageCount, total, onChange }: {
  page: number; pageCount: number; total: number; onChange: (p: number) => void;
}) {
  const first = (page - 1) * PER_PAGE + 1;
  const last = Math.min(page * PER_PAGE, total);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink/50">Showing {first}–{last} of {total} events</p>
      <div className="flex items-center gap-1">
        <PagerButton disabled={page === 1} onClick={() => onChange(page - 1)}>Previous</PagerButton>
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            aria-current={n === page ? 'page' : undefined}
            className={`min-w-9 rounded-lg px-3 py-1.5 text-sm font-bold ${
              n === page ? 'bg-plum text-white' : 'text-ink/60 hover:bg-cream/60'
            }`}
          >
            {n}
          </button>
        ))}
        <PagerButton disabled={page === pageCount} onClick={() => onChange(page + 1)}>Next</PagerButton>
      </div>
    </div>
  );
}

function PagerButton({ disabled, onClick, children }: {
  disabled: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg px-3 py-1.5 text-sm font-bold text-ink/60 hover:bg-cream/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
