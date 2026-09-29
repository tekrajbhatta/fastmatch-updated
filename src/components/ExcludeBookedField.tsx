'use client';

import { useEffect, useState } from 'react';
import { Select } from '@/components/ui';

interface UpcomingEvent { id: string; number: number; name: string; startsAt: string; venue: { name: string }; city: { name: string } }

/**
 * "Exclude booked members" on a blast (the old admin's "Exclude Event"):
 * leave out anyone who has already booked — into one chosen event, or into
 * any upcoming event — so a "book now" blast doesn't go to people already
 * coming. Unticked, the blast goes to everyone selected.
 */
export default function ExcludeBookedField({
  excludeBooked, eventId, onChange,
}: {
  excludeBooked: boolean;
  eventId: string | null;
  onChange: (patch: { excludeBooked?: boolean; excludeBookedEventId?: string | null }) => void;
}) {
  const [events, setEvents] = useState<UpcomingEvent[]>([]);

  useEffect(() => {
    fetch('/api/admin/events').then((r) => r.json()).then((all: UpcomingEvent[]) => {
      const now = Date.now();
      setEvents(all.filter((e) => new Date(e.startsAt).getTime() >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
    }).catch(() => {});
  }, []);

  return (
    <div className="mb-4 text-sm text-ink/70">
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5" checked={excludeBooked} onChange={(e) => onChange({ excludeBooked: e.target.checked })} />
        <span>
          Exclude booked members
          <span className="block text-xs text-ink/50">Doesn&apos;t send to members who have already booked. Untick to send to everyone selected.</span>
        </span>
      </label>
      {excludeBooked && (
        <div className="ml-6 mt-2 max-w-md">
          <Select value={eventId ?? ''} onChange={(e) => onChange({ excludeBookedEventId: e.target.value || null })}>
            <option value="">Booked into any upcoming event</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                Booked into #{e.number} {e.name} — {e.venue.name}, {new Date(e.startsAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}
