'use client';

import { useState, useEffect } from 'react';
import { venueLine } from '@/lib/venue';
import MemberEventsBrowser from '@/components/MemberEventsBrowser';
import EventCard from '@/components/site/EventCard';
import { Container, PageHero, PageLoader } from '@/components/site/layout';
import { formatEventForViewer } from '@/lib/timezone';

interface EventListItem {
  id: string;
  name: string;
  venue: { name: string; address: string | null };
  startsAt: string;
  ageMin: number;
  ageMax: number;
  // No booked counts here on purpose: members must not see how full an event
  // is (a half-empty night shouldn't talk anyone out of coming), and
  // /api/events no longer sends them at all.
  bookedByMe: boolean;
  theme: { name: string };
  city: { name: string };
}

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
    <>
      <PageHero title="Upcoming Events" lead="Find a speed dating event near you." />

      <section className="pb-[clamp(56px,6.7vw,96px)] pt-[clamp(24px,3.9vw,56px)]">
        {loading && (
          <Container>
            <PageLoader>Loading events…</PageLoader>
          </Container>
        )}
        {!loading && !loggedIn && events.length === 0 && (
          <Container>
            <p className="text-base leading-relaxed text-ink-600">No upcoming events right now. Check back soon.</p>
          </Container>
        )}

        {/* Logged-out visitors get the plain list they always had. Members get
            the old site's layout: the events they're booked into, then a table
            of what's on in their city, booked events first. */}
        {!loading && !loggedIn && events.length > 0 && <EventGrid events={events} />}
        {!loading && loggedIn && (
          <Container>
            <MemberEventsBrowser showBookedList />
          </Container>
        )}
      </section>
    </>
  );
}

function EventGrid({ events }: { events: EventListItem[] }) {
  return (
    // Three across on a desktop, two on a tablet, one on a phone — each card
    // at least 340px. A little closer to the screen edge than the page text
    // on phones (16px), as the cards carry their own border.
    <div className="mx-auto grid w-full max-w-[1264px] grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-[clamp(14px,1.7vw,24px)] px-[clamp(16px,2.2vw,32px)]">
      {events.map((event) => {
        const when = formatEventForViewer(event.startsAt, event.city.name);

        return (
          <EventCard
            key={event.id}
            href={`/events/${event.id}`}
            tag={event.theme.name}
            title={event.name}
            venue={`${venueLine(event.venue)}, ${event.city.name}`}
            date={`${when.shortDate}, ${when.time}`}
            zone={when.note ? `(${when.note})` : undefined}
            ages={`Ages ${event.ageMin}–${event.ageMax}`}
            badge={
              event.bookedByMe ? (
                <span className="whitespace-nowrap rounded-[999px_999px_999px_4px] bg-match-400 px-3 py-[5px] text-[13px] font-extrabold leading-[1.3] text-plum-900">
                  Booked
                </span>
              ) : undefined
            }
          />
        );
      })}
    </div>
  );
}
