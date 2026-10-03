'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, Button, Loader, BackLink } from '@/components/ui';
import { venueLine, venueBlock } from '@/lib/venue';
import { timeZoneForCity } from '@/lib/timezone';
import { Spinner } from '@/components/Spinner';

interface EventDetail {
  id: string; name: string; venue: { name: string; address: string | null; phone: string | null; websiteUrl: string | null }; startsAt: string; cost: string;
  theme: { name: string }; city: { name: string };
}

export default function AdminEventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeResult, setCloseResult] = useState<{ matchesCreated?: number; alreadyCalculated?: boolean } | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/events`).then((r) => r.json()).then((events: any[]) => {
      setEvent(events.find((e) => e.id === eventId) ?? null);
    });
  }, [eventId]);

  function createBlastForEvent() {
    if (!event) return;
    // The event's own local time, as members read it — not the admin's device clock.
    const date = new Date(event.startsAt);
    const timeZone = timeZoneForCity(event.city.name);
    const dateStr = date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone });
    const timeStr = date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone });

    // This is the actual fix for "creating a blast means retyping the same
    // info" — carries the event's real details through as query params so
    // the blast form can pre-fill itself, including a booking link that
    // points at this specific event, not a generic events page.
    const params = new URLSearchParams({
      subject: `${event.theme.name}, ${event.name}`,
      heading: event.theme.name,
      eventDetails: `When: ${dateStr}, ${timeStr}\nWhere: ${venueBlock(event.venue, event.city.name)}\nCost: $${event.cost}`,
      bookingLink: `${window.location.origin}/events/${event.id}`,
      // Only for the blast form's "← Back to event" link.
      fromEvent: event.id,
    });
    router.push(`/admin/blasts/new?${params.toString()}`);
  }

  // Copies the event and drops the admin straight into editing the copy —
  // almost always it's only the date that needs changing.
  async function handleDuplicate() {
    setDuplicating(true);
    setDuplicateError(null);
    const res = await fetch(`/api/admin/events/${eventId}/duplicate`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setDuplicating(false);
      setDuplicateError(typeof data.error === 'string' ? data.error : 'Could not duplicate this event.');
      return;
    }
    router.push(`/admin/events/${data.id}/edit?copiedFrom=${data.copiedFrom}`);
  }

  async function handleCloseEventNow() {
    setClosing(true);
    setCloseError(null);
    const res = await fetch(`/api/admin/events/${eventId}/close`, { method: 'POST' });
    const data = await res.json();
    setClosing(false);
    if (!res.ok) { setCloseError(data.error ?? 'Could not close the event.'); return; }
    setCloseResult(data);
  }

  if (!event) return <Loader label="Loading event…" />;

  return (
    <div className="mx-auto max-w-md">
      {/* At the top as well as the bottom: on a phone the bottom one is a
          long scroll away. */}
      <BackLink href="/admin/events">Back to events</BackLink>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">{event.name}</h1>
      <p className="mb-6 text-sm text-ink/60">{venueLine(event.venue)} · {new Date(event.startsAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', timeZone: timeZoneForCity(event.city.name) })}</p>

      <Card className="mb-3">
        <Link href={`/admin/events/${event.id}/bookings`} className="block font-bold text-ink hover:text-plum">View bookings</Link>
        <p className="mt-0.5 text-sm text-ink/50">Attendee list, payments, check-ins</p>
      </Card>
      <Card className="mb-3">
        <Link href={`/admin/events/${event.id}/edit`} className="block font-bold text-ink hover:text-plum">Edit event</Link>
      </Card>
      <Card className="mb-3">
        <button onClick={handleDuplicate} disabled={duplicating} className="flex items-center gap-2 text-left font-bold text-ink hover:text-plum disabled:opacity-50">
          {duplicating && <Spinner className="h-4 w-4 text-plum" />}
          {duplicating ? 'Duplicating…' : 'Duplicate event'}
        </button>
        <p className="mt-0.5 text-sm text-ink/50">Makes a copy with the same details, then opens it for editing</p>
        {duplicateError && <p className="mt-2 text-sm font-medium text-coral">{duplicateError}</p>}
      </Card>
      <Card className="mb-3">
        <button onClick={createBlastForEvent} className="block text-left font-bold text-ink hover:text-plum">Create blast for this event</button>
        <p className="mt-0.5 text-sm text-ink/50">Auto-fills subject, details, and booking link, so there&apos;s nothing to retype</p>
      </Card>
      <Card className="mb-3">
        <Link href={`/admin/events/${event.id}/bookings/new`} className="block font-bold text-ink hover:text-plum">Add a new booking</Link>
        <p className="mt-0.5 text-sm text-ink/50">Book one or more registered members into this event</p>
      </Card>
      <Card className="mb-3">
        <Link href={`/admin/events/${event.id}/members/new`} className="block font-bold text-ink hover:text-plum">Add a new member</Link>
        <p className="mt-0.5 text-sm text-ink/50">Register someone new and book them into this event</p>
      </Card>

      <Card className="mb-3">
        <div className="font-bold text-ink">Close event &amp; calculate matches</div>
        <p className="mt-0.5 mb-3 text-sm text-ink/50">
          Matches process automatically at midnight. Use this only to run them early (e.g. testing, or the host wants results before leaving the venue).
        </p>
        {closeResult ? (
          <p className="text-sm font-bold text-green-dark">
            {closeResult.alreadyCalculated ? 'Matches were already calculated for this event.' : `Done. ${closeResult.matchesCreated} matches created and result emails sent.`}
          </p>
        ) : (
          <Button onClick={handleCloseEventNow} disabled={closing} loading={closing} variant="ghost">
            {closing ? 'Calculating matches…' : 'Close event now & calculate early'}
          </Button>
        )}
        {closeError && <p className="mt-2 text-sm font-medium text-coral">{closeError}</p>}
      </Card>

      <Card className="mb-3">
        <Link href={`/admin/events/${event.id}/checkin-qr`} className="block font-bold text-ink hover:text-plum">Printable check-in QR code</Link>
        <p className="mt-0.5 text-sm text-ink/50">Display or print at the venue for attendees to scan when they check in</p>
      </Card>

      <Button variant="ghost" onClick={() => router.push('/admin/events')} className="w-full">Back to events</Button>
    </div>
  );
}
