'use client';

import { useEffect, useState } from 'react';
import { Field, Select } from '@/components/ui';
import { eventAvailability } from '@/lib/eventAvailability';
import { eventLabel } from '@/lib/eventLabel';
import { bookNowFill, bookNowEventId } from '@/lib/campaigns/blastFill';
import { eventClock } from '@/lib/timezone';

interface AdminEvent {
  id: string; name: string; startsAt: string; status: 'UPCOMING' | 'CLOSED' | 'CANCELLED';
  visibility: 'PUBLIC' | 'NOT_PUBLIC'; draft: boolean;
  theme: { name: string }; city: { name: string }; venue: { name: string };
}

/**
 * "Book Now goes to": pick the event the blast is about (Gil, item 19). The
 * booking link used to be typed or pasted, so a blast started from the
 * Blasts page had none, and its Book Now went to Upcoming Events rather than
 * the event.
 *
 * Picking one sets the booking link to that event's page and, while they're
 * still empty, the subject and heading (bookNowFill). Only events members can
 * book are offered: not past, cancelled, hidden or unsaved ones.
 */
export default function BookNowEventField({ bookingLink, subject, heading, onApply }: {
  bookingLink: string;
  subject: string;
  heading: string;
  onApply: (patch: { bookingLink: string; subject?: string; heading?: string }) => void;
}) {
  const [events, setEvents] = useState<AdminEvent[]>([]);

  useEffect(() => {
    fetch('/api/admin/events')
      .then((r) => (r.ok ? r.json() : []))
      .then((all: AdminEvent[]) => setEvents(Array.isArray(all) ? all.filter((e) => eventAvailability({ ...e, startsAt: new Date(e.startsAt) }) === 'open') : []))
      .catch(() => {});
  }, []);

  // The event the link already goes to, if it's one of these.
  const selected = bookNowEventId(bookingLink, events.map((e) => e.id));

  function pick(id: string) {
    const e = events.find((x) => x.id === id);
    if (e) onApply(bookNowFill(e, window.location.origin, { subject, heading }));
  }

  return (
    <Field label="Book Now goes to">
      <Select value={selected} onChange={(ev) => pick(ev.target.value)}>
        <option value="">{bookingLink.trim() ? 'The booking link below' : 'Upcoming Events (choose an event…)'}</option>
        {events.map((e) => (
          <option key={e.id} value={e.id}>
            {eventClock(e.startsAt, e.city.name).date({ weekday: 'short', day: 'numeric', month: 'short' })} · {eventLabel(e)} · {e.venue.name}, {e.city.name}
          </option>
        ))}
      </Select>
      <p className="mt-1 text-xs text-ink/50">
        Sets the booking link to that event&apos;s page, and fills in the subject and heading if they&apos;re empty. With no
        booking link, Book Now goes to Upcoming Events.
      </p>
    </Field>
  );
}
