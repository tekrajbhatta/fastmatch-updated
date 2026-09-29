'use client';

import Link from 'next/link';
import { isProfileMatch } from '@/lib/memberEvents';
import { formatEventForViewer } from '@/lib/timezone';

export interface MemberTableEvent {
  id: string;
  startsAt: string;
  ageMin: number;
  ageMax: number;
  cost: string | number;
  bookedByMe: boolean;
  cityId: string;
  maxMen: number;
  maxWomen: number;
  menBooked: number;
  womenBooked: number;
  theme: { name: string };
  venue: { name: string };
  city: { name: string };
}

const BUTTON = 'inline-block whitespace-nowrap rounded-lg bg-coral px-3 py-1.5 text-xs font-bold text-white hover:bg-coral/90';

/**
 * The old site's member events table: Event Type · Date · Venue · Ages · Cost
 * · View · Book · Profile Match. Rows arrive already ordered (see
 * orderForMember); events the member is booked into are shaded and say
 * "Booked in" instead of offering Book.
 */
export default function MemberEventsTable({
  events, age, showCity,
}: { events: MemberTableEvent[]; age: number | null; showCity: boolean }) {
  if (events.length === 0) return null;
  return (
    <>
    {/* Phones: the same rows stacked, so View and Book are never scrolled
        off the side of the screen. */}
    <ul className="space-y-2 sm:hidden">
      {events.map((e) => {
        // The event's own local time, noted if the viewer's clock differs.
        const when = formatEventForViewer(e.startsAt, e.city.name);
        const soldOut = e.menBooked + e.womenBooked >= e.maxMen + e.maxWomen;
        return (
          <li key={e.id} className={`rounded-xl border border-ink/10 p-3 ${e.bookedByMe ? 'bg-green/15' : 'bg-white'}`}>
            <div className="flex items-start justify-between gap-2">
              <span className="font-bold text-ink">{e.theme.name}</span>
              {isProfileMatch(e, age) && <span className="whitespace-nowrap text-xs font-bold text-plum">✓ Profile match</span>}
            </div>
            <p className="mt-0.5 text-sm text-ink/70">
              {when.shortDate}, {when.time}{when.note ? ` (${when.note})` : ''} · {e.venue.name}{showCity ? `, ${e.city.name}` : ''}
            </p>
            <p className="text-sm text-ink/70">Ages {e.ageMin} to {e.ageMax} · ${Number(e.cost).toFixed(2)}</p>
            <div className="mt-2 flex items-center gap-2">
              <Link href={`/events/${e.id}`} className={BUTTON}>View</Link>
              {e.bookedByMe ? (
                <span className="text-xs font-bold text-green-dark">Booked in</span>
              ) : soldOut ? (
                <span className="text-xs font-bold text-ink/40">Sold out</span>
              ) : (
                <Link href={`/events/${e.id}#book`} className={BUTTON}>Book</Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
    <div className="hidden overflow-x-auto rounded-xl border border-ink/10 bg-white sm:block">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-plum text-left text-xs font-bold text-green">
          <tr>
            <th className="px-3 py-2.5">Event Type</th>
            <th className="px-3 py-2.5">Date</th>
            <th className="px-3 py-2.5">Venue</th>
            {showCity && <th className="px-3 py-2.5">City</th>}
            <th className="px-3 py-2.5">Ages</th>
            <th className="px-3 py-2.5">Cost</th>
            <th className="px-3 py-2.5">View</th>
            <th className="px-3 py-2.5">Book</th>
            <th className="px-3 py-2.5 text-center">Profile Match</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => {
            const when = formatEventForViewer(e.startsAt, e.city.name);
            // Overall only — members aren't shown how many have booked, and
            // "full for your gender" is checked when they book.
            const soldOut = e.menBooked + e.womenBooked >= e.maxMen + e.maxWomen;
            const match = isProfileMatch(e, age);
            return (
              <tr key={e.id} className={`border-t border-ink/10 ${e.bookedByMe ? 'bg-green/15' : ''}`}>
                <td className="px-3 py-2.5 text-ink">{e.theme.name}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-ink">
                  {when.shortDate}
                  <span className="block text-xs text-ink/50">{when.time}{when.note ? ` (${when.note})` : ''}</span>
                </td>
                <td className="px-3 py-2.5 text-ink">{e.venue.name}</td>
                {showCity && <td className="px-3 py-2.5 text-ink/70">{e.city.name}</td>}
                <td className="whitespace-nowrap px-3 py-2.5 text-ink">{e.ageMin} to {e.ageMax}</td>
                <td className="px-3 py-2.5 text-ink">${Number(e.cost).toFixed(2)}</td>
                <td className="px-3 py-2.5"><Link href={`/events/${e.id}`} className={BUTTON}>View</Link></td>
                <td className="px-3 py-2.5">
                  {e.bookedByMe ? (
                    <span className="whitespace-nowrap text-xs font-bold text-green-dark">Booked in</span>
                  ) : soldOut ? (
                    <span className="whitespace-nowrap text-xs font-bold text-ink/40">Sold out</span>
                  ) : (
                    <Link href={`/events/${e.id}#book`} className={BUTTON}>Book</Link>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {match && (
                    <span className="text-lg font-extrabold text-plum" title="Your age is in this event's age range" aria-label="Matches your profile">✓</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
