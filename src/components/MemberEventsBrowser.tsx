'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import MemberEventsTable, { type MemberTableEvent } from '@/components/MemberEventsTable';
import { LoadingNote, SectionTitle } from '@/components/site/layout';
import { Field, SelectInput } from '@/components/site/form';
import { linkClass } from '@/components/site/button';
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

  if (!events || cityId === null) return <LoadingNote>Loading events…</LoadingNote>;

  const cityName = (id: string | null) => cities.find((c) => c.id === id)?.name;
  const rows = orderForMember(events, cityId || null);
  const booked = events.filter((e) => e.bookedByMe).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const where = cityId ? cityName(cityId) ?? 'your city' : 'all locations';

  return (
    <div>
      {showBookedList && booked.length > 0 && (
        // Booked = lime, as the booked rows in the table below.
        <section className="mb-[clamp(36px,4.4vw,56px)] rounded-card border border-match-400/60 bg-match-400/15 p-[clamp(20px,2.2vw,32px)]">
          <h2 className="font-display text-[clamp(22px,2vw,28px)] font-extrabold leading-[1.1] tracking-[-0.02em] text-plum-900">
            Events you are currently booked into
          </h2>
          <ul className="mt-4 flex flex-col gap-2.5">
            {booked.map((e) => {
              // "7:30 pm in Perth" — the event's own local time; naming the
              // city already says whose time it is.
              const when = formatEventForViewer(e.startsAt, e.city.name);
              return (
                <li key={e.id} className="rounded-field bg-white px-4 py-3.5 md:px-5">
                  <Link
                    href={`/events/${e.id}`}
                    className="rounded-sm text-base leading-snug text-ink-900 underline decoration-plum-700/30 underline-offset-4 hover:text-plum-700 hover:decoration-plum-700 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-plum-700"
                  >
                    <strong className="font-bold">{e.venue.name}</strong>
                    {' — '}
                    {when.dateWithYear}
                    {' — '}
                    {when.time} in {e.city.name}
                  </Link>
                  <span className="mt-1 block text-sm leading-snug text-ink-600">{e.theme.name} · Ages {e.ageMin}–{e.ageMax} · {venueLine(e.venue)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <SectionTitle className="mb-[clamp(16px,1.7vw,24px)]">Looking at events in {where}</SectionTitle>
      {rows.length > 0 ? (
        <MemberEventsTable events={rows} age={age} showCity={!cityId} />
      ) : (
        <p className="rounded-card border border-line bg-white p-[clamp(20px,1.8vw,26px)] text-base leading-relaxed text-ink-600">
          No upcoming events in {where} right now — check back soon.
        </p>
      )}

      <div className="mt-5 text-[15px] leading-normal text-ink-600">
        {choosing ? (
          <Field label="Show events in" className="max-w-[320px]">
            <SelectInput value={cityId} onChange={(e) => setCityId(e.target.value)}>
              <option value="">All locations</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}{c.id === homeCityId ? ' (your city)' : ''}</option>)}
            </SelectInput>
          </Field>
        ) : (
          <>
            For events in other locations click{' '}
            <button type="button" onClick={() => setChoosing(true)} className={linkClass}>here</button>
          </>
        )}
      </div>
    </div>
  );
}
