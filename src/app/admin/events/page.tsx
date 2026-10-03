'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, Loader } from '@/components/ui';
import { adminEventGroup, sortAdminEvents, GROUP_ORDER, type AdminEventGroup } from '@/lib/adminEventGroups';
import EventWhen from '@/components/EventWhen';

interface AdminEvent {
  id: string;
  number: number;
  name: string;
  venue: { name: string; address: string | null };
  startsAt: string;
  visibility: 'PUBLIC' | 'NOT_PUBLIC';
  status: string;
  confirmed: boolean;
  draft: boolean;
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
 * Gil's colour key, carried over from the old admin. Bright on purpose so the
 * groups are obvious at a glance; all four are pale enough that the dark
 * table text keeps well above AA contrast. Hover goes one step deeper.
 */
const GROUP_STYLE: Record<AdminEventGroup, { row: string; swatch: string; label: string }> = {
  confirmedNextWeek: {
    row: 'bg-[#FFF176] hover:bg-[#FFEE58]',
    swatch: 'bg-[#FFF176]',
    label: 'Confirmed event in the next week',
  },
  unconfirmedNextWeek: {
    row: 'bg-[#FFB74D] hover:bg-[#FFA726]',
    swatch: 'bg-[#FFB74D]',
    label: 'Unconfirmed event in the next week',
  },
  upcoming: {
    row: 'bg-[#AED581] hover:bg-[#9CCC65]',
    swatch: 'bg-[#AED581]',
    label: 'Upcoming event',
  },
  past: {
    row: 'bg-white hover:bg-cream/40',
    swatch: 'bg-white',
    label: 'Past event',
  },
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

  // One "now" for the whole render, so grouping and sorting agree with each
  // other and every row is judged against the same instant.
  const now = new Date();
  const sorted = sortAdminEvents(events, now);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  // Deleting the last event on the final page would otherwise strand the
  // viewer on an empty one.
  const currentPage = Math.min(page, pageCount);
  const visible = sorted.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Events</h1>
          <p className="text-sm text-ink/60">Numbers assign automatically, starting at #1.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/events/new"><Button>+ New event</Button></Link>
        </div>
      </div>

      {loading && <Loader label="Loading events…" />}

      <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white">
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
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => (
              <tr
                key={e.id}
                className={`cursor-pointer border-t border-ink/10 ${GROUP_STYLE[adminEventGroup(new Date(e.startsAt), e.confirmed, now)].row}`}
                onClick={() => (window.location.href = `/admin/events/${e.id}`)}
              >
                <td className="px-4 py-3 text-ink/60">#{e.number}</td>
                <td className="px-4 py-3 font-bold text-ink">
                  {e.name}
                  {e.seriesId && (
                    <Link href={`/admin/events/series/${e.seriesId}`} onClick={(ev) => ev.stopPropagation()} className="ml-2 whitespace-nowrap rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold text-plum ring-1 ring-plum/20">
                      part of a series
                    </Link>
                  )}
                </td>
                {/* Cell order must mirror the <th> order above: Date & Time,
                    Theme, City, Venue, Ages, Men, Women, Visibility, Action. */}
                <td className="whitespace-nowrap px-4 py-3">
                  <EventWhen startsAt={e.startsAt} city={e.city.name} />
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
                {/* A solid white chip rather than <Badge>: the badge's pale
                    tint vanishes against the coloured rows. */}
                <td className="px-4 py-3">
                  {e.draft ? (
                    <span className="inline-block whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-xs font-bold text-coral">Draft</span>
                  ) : (
                    <span className={`inline-block whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-xs font-bold ${e.visibility === 'PUBLIC' ? 'text-green-dark' : 'text-ink/60'}`}>
                      {e.visibility === 'PUBLIC' ? 'Public' : 'Not public'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {/* Same destination as clicking the row — a visible target
                      for people who don't think to click a table row. */}
                  <Link
                    href={`/admin/events/${e.id}`}
                    onClick={(ev) => ev.stopPropagation()}
                    className="inline-block rounded-lg border border-plum bg-white px-3 py-1.5 text-xs font-bold text-plum hover:bg-plum hover:text-white"
                  >
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Hidden until there is a second page — a lone "Page 1 of 1" is just
          clutter on a short list. */}
      {pageCount > 1 && (
        <Pager page={currentPage} pageCount={pageCount} total={sorted.length} onChange={setPage} />
      )}

      {/* The key sits under the table, as it did on the old admin, in the same
          order the groups appear. */}
      <div className="mt-6 overflow-hidden rounded-xl border border-ink/10 bg-white">
        <div className="bg-cream/50 px-4 py-2 text-xs font-bold uppercase text-ink/50">Legend</div>
        <div className="grid sm:grid-cols-4">
          {GROUP_ORDER.map((g) => (
            <div key={g} className={`border-t border-ink/10 px-4 py-2.5 text-sm font-semibold text-ink sm:border-l sm:first:border-l-0 ${GROUP_STYLE[g].swatch}`}>
              {GROUP_STYLE[g].label}
            </div>
          ))}
        </div>
      </div>
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
