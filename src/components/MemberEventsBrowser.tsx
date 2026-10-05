'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import MemberEventsTable, { type MemberTableEvent } from '@/components/MemberEventsTable';
import { SectionTitle, PageLoader } from '@/components/site/layout';
import { Field, SelectInput } from '@/components/site/form';
import { linkClass } from '@/components/site/button';
import { orderForMember } from '@/lib/memberEvents';
import { calculateAge } from '@/lib/age';
import { venueLine } from '@/lib/venue';
import { formatEventForViewer } from '@/lib/timezone';
import CheckInAction from '@/components/site/CheckInAction';
import type { CheckInState } from '@/lib/eventNight';

interface City { id: string; name: string }
type ApiEvent = MemberTableEvent & { venue: { name: string; address: string | null } };
/** One of the member's bookings still to come (GET /api/account/bookings). */
interface BookedEvent {
  id: string; name: string; startsAt: string; ageMin: number; ageMax: number;
  theme: { name: string }; city: { name: string }; venue: { name: string; address: string | null };
  checkedIn: boolean; checkIn: CheckInState; checkInOpensAt: string;
}

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
  // The member's bookings until midnight on each night, with their check-in
  // button: the events list above drops an event as soon as it starts.
  const [booked, setBooked] = useState<BookedEvent[]>([]);

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
        if (showBookedList) {
          fetch('/api/account/bookings').then((r) => (r.ok ? r.json() : [])).then((b) => setBooked(Array.isArray(b) ? b : [])).catch(() => {});
        }
      } else {
        setCityId('');
      }
    });
  }, [showBookedList]);

  if (!events || cityId === null) return <PageLoader>Loading events…</PageLoader>;

  const cityName = (id: string | null) => cities.find((c) => c.id === id)?.name;
  const rows = orderForMember(events, cityId || null);
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
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-field bg-white px-4 py-3.5 md:px-5">
                  <div className="min-w-0 flex-[1_1_320px]">
                  <Link
                    href={`/events/${e.id}`}
                    className="rounded-sm text-base leading-snug text-ink-900 underline decoration-plum-700/30 underline-offset-4 hover:text-plum-700 hover:decoration-plum-700 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-plum-700"
                  >
                    <strong className="font-bold">{e.venue.name}</strong>
                    {' · '}
                    {when.dateWithYear}
                    {' · '}
                    {when.time} in {e.city.name}
                  </Link>
                  <span className="mt-1 block text-sm leading-snug text-ink-600">{e.theme.name} · Ages {e.ageMin}–{e.ageMax} · {venueLine(e.venue)}</span>
                  </div>
                  <div className="flex-none">
                    <CheckInAction eventId={e.id} cityName={e.city.name} state={e.checkIn} opensAt={e.checkInOpensAt} checkedIn={e.checkedIn} />
                  </div>
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
          No upcoming events in {where} right now. Check back soon.
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
