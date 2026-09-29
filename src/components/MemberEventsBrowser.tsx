'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Select } from '@/components/ui';
import MemberEventsTable, { type MemberTableEvent } from '@/components/MemberEventsTable';
import { orderForMember } from '@/lib/memberEvents';
import { calculateAge } from '@/lib/age';
import { venueLine } from '@/lib/venue';
import { formatEventForViewer } from '@/lib/timezone';

interface City { id: string; name: string }
type ApiEvent = MemberTableEvent & { venue: { name: string; address: string | null } };

/**
 * The logged-in member's view of what's on, as on the old site: optionally
 * the events they're booked into as a list, then the events table for their
 * own city — with "For events in other locations click here" to look
 * elsewhere. Used by Upcoming Events and My Match History.
 */
export default function MemberEventsBrowser({ showBookedList }: { showBookedList: boolean }) {
  const [events, setEvents] = useState<ApiEvent[] | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [age, setAge] = useState<number | null>(null);
  const [homeCityId, setHomeCityId] = useState<string | null>(null);
  // '' = every location
  const [cityId, setCityId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/events').then((r) => r.json()),
      fetch('/api/auth/me').then((r) => r.json()).catch(() => ({ member: null })),
      fetch('/api/cities').then((r) => r.json()),
    ]).then(([ev, me, cs]) => {
      setEvents(Array.isArray(ev) ? ev : []);
      setCities(Array.isArray(cs) ? cs : []);
      if (me?.member) {
        setAge(calculateAge(new Date(me.member.dateOfBirth)));
        setHomeCityId(me.member.cityId);
        setCityId(me.member.cityId);
      } else {
        setCityId('');
      }
    });
  }, []);

  if (!events || cityId === null) return <p className="text-sm text-ink/50">Loading events…</p>;

  const cityName = (id: string | null) => cities.find((c) => c.id === id)?.name;
  const rows = orderForMember(events, cityId || null);
  const booked = events.filter((e) => e.bookedByMe).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const where = cityId ? cityName(cityId) ?? 'your city' : 'all locations';

  return (
    <div>
      {showBookedList && booked.length > 0 && (
        <section className="mb-8 rounded-2xl border border-green/30 bg-green/5 p-4 sm:p-5">
          <h2 className="mb-2 text-lg font-extrabold text-plum">Events you are currently booked into</h2>
          <ul className="space-y-1.5">
            {booked.map((e) => {
              // "7:30 pm in Perth" — the event's own local time; naming the
              // city already says whose time it is.
              const when = formatEventForViewer(e.startsAt, e.city.name);
              return (
                <li key={e.id}>
                  <Link href={`/events/${e.id}`} className="text-ink hover:text-plum hover:underline">
                    <strong>{e.venue.name}</strong>
                    {' — '}
                    {when.dateWithYear}
                    {' — '}
                    {when.time} in {e.city.name}
                  </Link>
                  <span className="block text-xs text-ink/50">{e.theme.name} · Ages {e.ageMin}–{e.ageMax} · {venueLine(e.venue)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <h2 className="mb-3 text-xl font-extrabold text-ink">Looking at events in {where}</h2>
      {rows.length > 0 ? (
        <MemberEventsTable events={rows} age={age} showCity={!cityId} />
      ) : (
        <p className="rounded-xl border border-ink/10 bg-white p-4 text-sm text-ink/60">No upcoming events in {where} right now — check back soon.</p>
      )}

      <div className="mt-3 text-sm text-ink/70">
        {choosing ? (
          <label className="flex max-w-xs items-center gap-2">
            <span className="whitespace-nowrap">Show events in</span>
            <Select value={cityId} onChange={(e) => setCityId(e.target.value)}>
              <option value="">All locations</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}{c.id === homeCityId ? ' (your city)' : ''}</option>)}
            </Select>
          </label>
        ) : (
          <>
            For events in other locations click{' '}
            <button type="button" onClick={() => setChoosing(true)} className="font-bold text-plum underline">here</button>
          </>
        )}
      </div>
    </div>
  );
}
