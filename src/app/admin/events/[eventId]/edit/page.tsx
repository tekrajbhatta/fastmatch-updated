'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Field, Input, Select, Button, Card, Loader, BackLink } from '@/components/ui';
import PhotoUploadField from '@/components/PhotoUploadField';
import EventFlagFields from '@/components/EventFlagFields';
import VenueInfoPanel, { venueFillPatch } from '@/components/VenueInfoPanel';
import { toDateTimeLocalValue, fromDateTimeLocalValue } from '@/lib/datetime';
import { timeZoneForCity } from '@/lib/timezone';
import { checkEventFields, eventNumbers, EVENT_NUMBER_FIELDS, CHECK_FIELDS, type EventFieldErrors } from '@/lib/eventInput';

interface City { id: string; name: string; }
interface Theme { id: string; name: string; }
interface Venue { id: string; name: string; logoUrl: string | null; imageUrl: string | null; description: string | null; city: { id: string; name: string }; }

export default function EditEventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const [cities, setCities] = useState<City[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What's wrong with each box, shown under it — the same rules as New event.
  const [fieldErrors, setFieldErrors] = useState<EventFieldErrors>({});
  // Rescheduling notifies every confirmed booking. Individual sends can fail
  // without failing the save, so the admin is told who to chase manually
  // instead of the failures only reaching the server log.
  const [notifyFailures, setNotifyFailures] = useState<{ member: string; channel: string }[]>([]);
  // Set when arriving from "Duplicate event". Read from the URL directly
  // rather than useSearchParams, which would need a Suspense boundary.
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  const [isDraft, setIsDraft] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  // The start time as loaded. Saving with the date, time and city untouched
  // sends this back exactly, so the "has the time changed?" check can't be
  // tripped (it texts every attendee) by a value that only looks the same.
  const loaded = useRef<{ startsAt: string; wall: string; cityId: string; cityName: string; venueId: string; visibility: string; attendees: number } | null>(null);
  // Saving a new time or venue emails and texts every paid attendee: the
  // admin is asked first. Hiding the event tells nobody (Gil, Q3).
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [notifiedAbout, setNotifiedAbout] = useState<{ time: boolean; venue: boolean } | null>(null);
  useEffect(() => {
    setCopiedFrom(new URLSearchParams(window.location.search).get('copiedFrom'));
  }, []);

  useEffect(() => {
    fetch('/api/cities').then((r) => r.json()).then(setCities);
    fetch('/api/event-themes').then((r) => r.json()).then(setThemes);
    fetch('/api/admin/venues').then((r) => r.json()).then(setVenues);
    fetch(`/api/admin/events/${eventId}`).then((r) => (r.ok ? r.json() : null)).then((e: any) => {
      if (e) {
        setIsDraft(!!e.draft);
        setIsCancelled(e.status === 'CANCELLED');
        // Shown on the event city's clock, as it's advertised.
        const wall = toDateTimeLocalValue(e.startsAt, timeZoneForCity(e.city?.name));
        loaded.current = {
          startsAt: e.startsAt, wall, cityId: e.cityId, cityName: e.city?.name ?? '',
          venueId: e.venueId, visibility: e.visibility, attendees: (e.menBooked ?? 0) + (e.womenBooked ?? 0),
        };
        setForm({
          name: e.name, description: e.description ?? '', photoUrl: e.photoUrl ?? '', themeId: e.themeId, cityId: e.cityId, venueId: e.venueId,
          startsAt: wall, ageMin: e.ageMin, ageMax: e.ageMax,
          maxMen: e.maxMen, maxWomen: e.maxWomen, cost: e.cost,
          expenses: e.expenses ?? '', visibility: e.visibility, confirmed: !!e.confirmed,
          fastmatchDiscounts: e.fastmatchDiscounts ?? true, groupDiscounts: e.groupDiscounts ?? true,
          ratingAudience: e.ratingAudience ?? 'OPPOSITE_GENDER',
        });
      }
    });
  }, [eventId]);

  // The city whose clock the start time is on (the loaded event's own city
  // until the list of cities arrives).
  const cityName: string | undefined = form
    ? cities.find((c) => c.id === form.cityId)?.name ?? (form.cityId === loaded.current?.cityId ? loaded.current?.cityName : undefined)
    : undefined;

  async function handleSave(e: React.FormEvent, confirmed = false) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setNotifyFailures([]);
    const was = loaded.current;
    const startsAt = was && form.startsAt === was.wall && form.cityId === was.cityId
      ? was.startsAt
      : fromDateTimeLocalValue(form.startsAt, timeZoneForCity(cityName));
    const body = {
      ...form,
      // An empty box is null: reported for a maximum, and clears the expenses.
      ...eventNumbers(form, [...EVENT_NUMBER_FIELDS]),
      startsAt: startsAt ?? '',
      // Saving this form is what takes a duplicated event out of draft.
      draft: false,
    };
    const checked = checkEventFields(body);
    if (!checked.ok) { setFieldErrors(checked.fieldErrors); setError(CHECK_FIELDS); setPendingNotice(null); return; }

    // The same two changes the server notifies about (see its PATCH) — not
    // for an event that has already started: that's a correction, nobody is told.
    if (!confirmed && was && was.attendees > 0 && new Date(was.startsAt).getTime() > Date.now()) {
      const changes = [
        new Date(startsAt).getTime() !== new Date(was.startsAt).getTime() && 'the new date and time',
        form.venueId !== was.venueId && 'the new venue',
      ].filter(Boolean) as string[];
      if (changes.length) {
        setPendingNotice(`This will email and text ${was.attendees} attendee${was.attendees === 1 ? '' : 's'} about ${changes.join(' and ')}.`);
        return;
      }
    }
    setPendingNotice(null);
    setSaving(true);
    const res = await fetch(`/api/admin/events/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setFieldErrors(data.fieldErrors ?? {});
      setPendingNotice(null);
      setError(typeof data.error === 'string' ? data.error : 'Please check your details.');
      return;
    }
    // The event IS saved either way — stay on the page only to show who
    // didn't get their notification.
    if (Array.isArray(data.notifyFailures) && data.notifyFailures.length > 0) {
      setNotifyFailures(data.notifyFailures);
      setNotifiedAbout(data.notifiedAbout ?? null);
      return;
    }
    router.push(`/admin/events/${eventId}`);
  }

  if (!form) return <Loader label="Loading event…" />;
  const err = (k: string) => fieldErrors[k];

  return (
    <div className="mx-auto max-w-lg">
      <BackLink href={`/admin/events/${eventId}`}>Back to event</BackLink>
      <h1 className="mb-6 text-2xl font-extrabold text-ink">Edit event</h1>
      {isCancelled && (
        <p className="mb-4 rounded-lg bg-coral/10 p-3 text-sm font-bold text-coral">This event was cancelled. It isn&apos;t on the site and can&apos;t be booked.</p>
      )}
      {isDraft && (
        <p className="mb-4 rounded-lg bg-amber/15 p-3 text-sm text-ink">
          <strong>{copiedFrom ? `This is a copy of event #${copiedFrom}, saved as a draft.` : 'This event is a draft.'}</strong>{' '}
          It isn&apos;t visible to the public or bookable until you save this form, so change the date and anything else first.
        </p>
      )}
      <Card>
        <form onSubmit={handleSave}>
          <Field label="Event type" error={err('themeId')}>
            <Select value={form.themeId} onChange={(e) => setForm({ ...form, themeId: e.target.value })}>
              {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Event name / description" error={err('name')}>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Event description">
            <textarea className="w-full rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-base outline-none sm:text-sm focus:border-plum" rows={4}
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Shown to members on the event page, under the photo." />
          </Field>
          <PhotoUploadField value={form.photoUrl} onChange={(url) => setForm({ ...form, photoUrl: url })}
            hint="Optional. Shown at the top of the event page." />
          {/* Bottom-aligned: the start label names the city's clock, and a
              long city name wraps it onto a second line. */}
          {/* One above the other on a phone: side by side, the date and time box was too narrow to read. */}
          <div className="grid items-end gap-x-3 sm:grid-cols-2">
            <Field label={`Start date & time (${cityName ?? 'event city'} time)`} error={err('startsAt')}>
              <Input type="datetime-local" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            </Field>
            <Field label="City" error={err('cityId')}>
              <Select value={form.cityId} onChange={(e) => setForm({ ...form, cityId: e.target.value })}>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Venue" error={err('venueId')}>
            <Select required value={form.venueId} onChange={(e) => {
              const venueId = e.target.value;
              // Fills only the event's EMPTY photo/description — see VenueInfoPanel.
              setForm((f: any) => ({ ...f, venueId, ...venueFillPatch(f, venues.find((v) => v.id === venueId)) }));
            }}>
              <option value="">Select a venue…</option>
              {venues.filter((v) => v.city.id === form.cityId).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
            <p className="mt-1 text-xs text-ink/50">
              Only venues in the selected city are listed.{' '}
              <Link href="/admin/venues" className="font-bold text-plum hover:underline">Manage venues</Link>
            </p>
            <VenueInfoPanel venue={venues.find((v) => v.id === form.venueId)} photoUrl={form.photoUrl} description={form.description}
              onUse={(patch) => setForm((f: any) => ({ ...f, ...patch }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Age min" error={err('ageMin')}><Input type="number" required value={form.ageMin} onChange={(e) => setForm({ ...form, ageMin: e.target.value })} /></Field>
            <Field label="Age max" error={err('ageMax')}><Input type="number" required value={form.ageMax} onChange={(e) => setForm({ ...form, ageMax: e.target.value })} /></Field>
          </div>
          <Field label="Cost ($)" error={err('cost')}><Input type="number" step="0.01" required value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max men" error={err('maxMen')}><Input type="number" value={form.maxMen} onChange={(e) => setForm({ ...form, maxMen: e.target.value })} /></Field>
            <Field label="Max women" error={err('maxWomen')}><Input type="number" value={form.maxWomen} onChange={(e) => setForm({ ...form, maxWomen: e.target.value })} /></Field>
          </div>
          <Field label="Expenses ($)" error={err('expenses')}><Input type="number" step="0.01" value={form.expenses} onChange={(e) => setForm({ ...form, expenses: e.target.value })} /></Field>

          <label className="mb-4 flex items-start gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" className="mt-0.5" checked={form.visibility === 'PUBLIC'} onChange={(e) => setForm({ ...form, visibility: e.target.checked ? 'PUBLIC' : 'NOT_PUBLIC' })} />
            <span>
              Visible to the public
              <span className="block text-xs font-normal text-ink/50">
                Untick to take it off the site, so it can&apos;t be booked online. Nothing else changes: bookings stay and nobody is told.
                To call it off, use &ldquo;Cancel event&rdquo; on the event&apos;s page.
              </span>
            </span>
          </label>
          <EventFlagFields value={form} onChange={(patch) => setForm({ ...form, ...patch })} />

          {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}
          {notifyFailures.length > 0 && (
            <div className="mb-4 rounded-lg bg-cream/60 p-3 text-sm">
              <p className="font-bold text-ink">Event saved, but {notifyFailures.length} notification{notifyFailures.length === 1 ? '' : 's'} couldn&apos;t be sent:</p>
              <ul className="mt-1 list-inside list-disc text-ink/70">
                {notifyFailures.map((f, i) => <li key={i}>{f.member} ({f.channel.toUpperCase()})</li>)}
              </ul>
              <p className="mt-1 text-ink/60">
                Please contact them directly about{' '}
                {[notifiedAbout?.time && 'the new date and time', notifiedAbout?.venue && 'the new venue'].filter(Boolean).join(' and ') || 'the change'}.
              </p>
            </div>
          )}
          {pendingNotice ? (
            <div className="rounded-lg bg-amber/15 p-3 text-sm text-ink">
              <p className="mb-3 font-bold">{pendingNotice}</p>
              <div className="flex gap-2">
                <Button type="button" onClick={(ev) => handleSave(ev, true)} disabled={saving} loading={saving}>{saving ? 'Saving…' : 'Save and notify them'}</Button>
                <Button type="button" variant="ghost" onClick={() => setPendingNotice(null)} disabled={saving}>Go back</Button>
              </div>
            </div>
          ) : (
            <Button type="submit" disabled={saving} loading={saving} className="w-full">{saving ? 'Saving…' : 'Save changes'}</Button>
          )}
        </form>
      </Card>
    </div>
  );
}
