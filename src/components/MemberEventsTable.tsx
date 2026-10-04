'use client';

import Link from 'next/link';
import { buttonClass } from '@/components/site/button';
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
  // Every place taken (worked out by the server; the counts stay private).
  soldOut: boolean;
  // Every place for the signed-in member's gender taken: sold out for them too.
  fullForYou: boolean;
  theme: { name: string };
  venue: { name: string };
  city: { name: string };
}

// View is the plum outline, Book the coral primary — the row's main action.
const VIEW = buttonClass({ variant: 'secondary', size: 'sm' });
const BOOK = buttonClass({ variant: 'primary', size: 'sm' });
// "Booked in" / "Sold out" are statuses, not buttons: speech-bubble pills.
const STATUS = 'inline-block whitespace-nowrap rounded-[999px_999px_999px_4px] px-3 py-[5px] text-[13px] font-extrabold leading-[1.3]';
const BOOKED_IN = `${STATUS} bg-match-400 text-plum-900`;
const SOLD_OUT = `${STATUS} bg-[#E9E4EC] text-ink-600`;
const CELL = 'px-4 py-3.5 first:pl-6 last:pr-6';

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
    <ul className="flex flex-col gap-3 md:hidden">
      {events.map((e) => {
        // The event's own local time, noted if the viewer's clock differs.
        const when = formatEventForViewer(e.startsAt, e.city.name);
        const soldOut = e.soldOut || e.fullForYou;
        return (
          <li
            key={e.id}
            className={`rounded-card border p-5 ${e.bookedByMe ? 'border-match-400/60 bg-match-400/15' : 'border-line bg-white'}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
              <span className="font-display text-[22px] font-extrabold leading-[1.15] tracking-[-0.02em] text-ink-900">{e.theme.name}</span>
              {isProfileMatch(e, age) && (
                <span className="whitespace-nowrap rounded-[999px_999px_999px_4px] bg-plum-100 px-3 py-[5px] text-[13px] font-bold leading-[1.3] text-plum-700">
                  ✓ Profile match
                </span>
              )}
            </div>
            <p className="mt-2 text-[15px] leading-normal text-ink-600">
              {when.shortDate}, {when.time}{when.note ? ` (${when.note})` : ''} · {e.venue.name}{showCity ? `, ${e.city.name}` : ''}
            </p>
            <p className="text-[15px] leading-normal text-ink-600">Ages {e.ageMin} to {e.ageMax} · ${Number(e.cost).toFixed(2)}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <Link href={`/events/${e.id}`} className={VIEW}>View</Link>
              {e.bookedByMe ? (
                <span className={BOOKED_IN}>Booked in</span>
              ) : soldOut ? (
                <span className={SOLD_OUT}>Sold out</span>
              ) : (
                <Link href={`/events/${e.id}#book`} className={BOOK}>Book</Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
    <div className="hidden overflow-x-auto rounded-card border border-line bg-white md:block">
      <table className="w-full min-w-[720px] text-[15px]">
        <thead className="bg-plum-900 text-left text-[13px] font-extrabold uppercase tracking-[0.08em] text-match-300">
          <tr>
            <th scope="col" className={CELL}>Event Type</th>
            <th scope="col" className={CELL}>Date</th>
            <th scope="col" className={CELL}>Venue</th>
            {showCity && <th scope="col" className={CELL}>City</th>}
            <th scope="col" className={CELL}>Ages</th>
            <th scope="col" className={CELL}>Cost</th>
            <th scope="col" className={CELL}>View</th>
            <th scope="col" className={CELL}>Book</th>
            <th scope="col" className={`${CELL} text-center`}>Profile Match</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => {
            const when = formatEventForViewer(e.startsAt, e.city.name);
            // Overall only — members aren't shown how many have booked, and
            // "full for your gender" is checked when they book.
            const soldOut = e.soldOut || e.fullForYou;
            const match = isProfileMatch(e, age);
            return (
              <tr key={e.id} className={`border-t border-line ${e.bookedByMe ? 'bg-match-400/15' : ''}`}>
                <td className={`${CELL} font-semibold text-ink-900`}>{e.theme.name}</td>
                <td className={`${CELL} whitespace-nowrap text-ink-900`}>
                  {when.shortDate}
                  <span className="block text-[13px] text-ink-600">{when.time}{when.note ? ` (${when.note})` : ''}</span>
                </td>
                <td className={`${CELL} text-ink-900`}>{e.venue.name}</td>
                {showCity && <td className={`${CELL} text-ink-600`}>{e.city.name}</td>}
                <td className={`${CELL} whitespace-nowrap text-ink-900`}>{e.ageMin} to {e.ageMax}</td>
                <td className={`${CELL} tabular-nums text-ink-900`}>${Number(e.cost).toFixed(2)}</td>
                <td className={CELL}><Link href={`/events/${e.id}`} className={VIEW}>View</Link></td>
                <td className={CELL}>
                  {e.bookedByMe ? (
                    <span className={BOOKED_IN}>Booked in</span>
                  ) : soldOut ? (
                    <span className={SOLD_OUT}>Sold out</span>
                  ) : (
                    <Link href={`/events/${e.id}#book`} className={BOOK}>Book</Link>
                  )}
                </td>
                <td className={`${CELL} text-center`}>
                  {match && (
                    <span
                      role="img"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-plum-100 text-base font-extrabold text-plum-700"
                      title="Your age is in this event's age range"
                      aria-label="Matches your profile"
                    >
                      ✓
                    </span>
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
