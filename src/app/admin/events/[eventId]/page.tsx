'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, Button, Loader, BackLink } from '@/components/ui';
import { venueLine, venueBlock } from '@/lib/venue';
import { timeZoneForCity } from '@/lib/timezone';
import { Spinner } from '@/components/Spinner';
import { formatPrice } from '@/lib/price';

interface EventDetail {
  id: string; name: string; venue: { name: string; address: string | null; phone: string | null; websiteUrl: string | null }; startsAt: string; cost: string;
  theme: { name: string }; city: { name: string };
  status: string;
  // Every booking, any status (from /api/admin/events).
  _count: { bookings: number };
}

export default function AdminEventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeResult, setCloseResult] = useState<{ matchesCreated?: number; alreadyCalculated?: boolean; emailsSent?: number; emailFailures?: string[] } | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  // Where the results stand, and the "are you sure?" step before working them
  // out early: one tap used to lock in incomplete results with no trace.
  const [closeStatus, setCloseStatus] = useState<{ checkedIn: number; submitted: number; matchesCalculated: boolean; matchesCalculatedAt: string | null; emailed: number } | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/events`).then((r) => r.json()).then((events: any[]) => {
      setEvent(events.find((e) => e.id === eventId) ?? null);
    });
    loadCloseStatus();
  }, [eventId]);

  function loadCloseStatus() {
    return fetch(`/api/admin/events/${eventId}/close`).then((r) => (r.ok ? r.json() : null)).then(setCloseStatus).catch(() => {});
  }

  async function askToClose() {
    setCloseError(null);
    await loadCloseStatus(); // the latest count of who's sent choices
    setConfirmingClose(true);
  }

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
      eventDetails: `When: ${dateStr}, ${timeStr}\nWhere: ${venueBlock(event.venue, event.city.name)}\nCost: ${formatPrice(event.cost)}`,
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

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch(`/api/admin/events/${eventId}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    setDeleting(false);
    if (!res.ok) { setDeleteError(typeof data.error === 'string' ? data.error : 'Could not delete this event.'); return; }
    router.push('/admin/events');
  }

  async function handleCloseEventNow() {
    setClosing(true);
    setCloseError(null);
    const res = await fetch(`/api/admin/events/${eventId}/close`, { method: 'POST' });
    const data = await res.json();
    setClosing(false);
    setConfirmingClose(false);
    if (!res.ok) { setCloseError(data.error ?? 'Could not close the event.'); return; }
    setCloseResult(data);
    loadCloseStatus();
  }

  if (!event) return <Loader label="Loading event…" />;

  return (
    <div className="mx-auto max-w-md">
      {/* At the top as well as the bottom: on a phone the bottom one is a
          long scroll away. */}
      <BackLink href="/admin/events">Back to events</BackLink>
      {event.status === 'CANCELLED' && (
        <p className="mb-4 rounded-lg bg-coral/10 p-3 text-sm font-bold text-coral">This event was cancelled. It isn&apos;t on the site and can&apos;t be booked.</p>
      )}
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
          Results are worked out automatically after midnight (the event city&apos;s time), when choices close. Use this only to run them early (e.g. testing, or the host wants results before leaving the venue).
        </p>
        {closeStatus?.matchesCalculated && !closeResult ? (
          <p className="text-sm font-bold text-green-dark">
            Calculated on{' '}
            {closeStatus.matchesCalculatedAt
              ? new Date(closeStatus.matchesCalculatedAt).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
              : 'an earlier date'}
            {' '}· {closeStatus.emailed} {closeStatus.emailed === 1 ? 'person' : 'people'} emailed their matches.
          </p>
        ) : confirmingClose && !closeResult ? (
          <div className="rounded-lg bg-amber/15 p-3 text-sm text-ink">
            <p className="mb-3">
              <strong>{closeStatus?.submitted ?? 0} of {closeStatus?.checkedIn ?? 0}</strong> people checked in have sent their choices so far.
              Anyone who hasn&apos;t won&apos;t count: choices close as soon as the results are worked out, and they can&apos;t be worked out again.
            </p>
            <div className="flex gap-2">
              <Button onClick={handleCloseEventNow} disabled={closing} loading={closing}>{closing ? 'Calculating matches…' : 'Work out results now'}</Button>
              <Button variant="ghost" onClick={() => setConfirmingClose(false)} disabled={closing}>Not yet</Button>
            </div>
          </div>
        ) : closeResult ? (
          <>
            <p className="text-sm font-bold text-green-dark">
              {closeResult.alreadyCalculated
                ? 'Matches were already calculated for this event.'
                : `Done. ${closeResult.matchesCreated} matches created, ${closeResult.emailsSent ?? 0} result email${closeResult.emailsSent === 1 ? '' : 's'} sent.`}
            </p>
            {!!closeResult.emailFailures?.length && (
              <p className="mt-1 text-sm font-medium text-coral">
                {closeResult.emailFailures.length} couldn&apos;t be emailed: {closeResult.emailFailures.join(', ')}. Their matches are on My Match History.
              </p>
            )}
          </>
        ) : (
          <Button onClick={askToClose} variant="ghost">Close event now &amp; calculate early</Button>
        )}
        {closeError && <p className="mt-2 text-sm font-medium text-coral">{closeError}</p>}
      </Card>

      <Card className="mb-3">
        <Link href={`/admin/events/${event.id}/checkin-qr`} className="block font-bold text-ink hover:text-plum">Printable check-in QR code</Link>
        <p className="mt-0.5 text-sm text-ink/50">Display or print at the venue for attendees to scan when they check in</p>
      </Card>

      {/* Only for an event nobody has booked (a duplicate made by mistake, say):
          one with bookings is never deleted. */}
      {event._count.bookings === 0 && (
        <Card className="mb-3">
          <div className="font-bold text-ink">Delete event</div>
          <p className="mt-0.5 mb-3 text-sm text-ink/50">Nobody has booked it, so it can be removed completely. This can&apos;t be undone.</p>
          {confirmingDelete ? (
            <div className="flex gap-2">
              <Button variant="danger" onClick={handleDelete} disabled={deleting} loading={deleting}>{deleting ? 'Deleting…' : 'Yes, delete it'}</Button>
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Keep it</Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>Delete event</Button>
          )}
          {deleteError && <p className="mt-2 text-sm font-medium text-coral">{deleteError}</p>}
        </Card>
      )}

      <Button variant="ghost" onClick={() => router.push('/admin/events')} className="w-full">Back to events</Button>
    </div>
  );
}
