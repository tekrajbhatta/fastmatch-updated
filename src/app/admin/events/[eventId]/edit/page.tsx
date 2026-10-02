'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Field, Input, Select, Button, Card, Loader, BackLink } from '@/components/ui';
import PhotoUploadField from '@/components/PhotoUploadField';
import EventFlagFields from '@/components/EventFlagFields';
import VenueInfoPanel, { venueFillPatch } from '@/components/VenueInfoPanel';
import { toDateTimeLocalValue, fromDateTimeLocalValue } from '@/lib/datetime';

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
  // Rescheduling notifies every confirmed booking. Individual sends can fail
  // without failing the save, so the admin is told who to chase manually
  // instead of the failures only reaching the server log.
  const [notifyFailures, setNotifyFailures] = useState<{ member: string; channel: string }[]>([]);
  // Set when arriving from "Duplicate event". Read from the URL directly
  // rather than useSearchParams, which would need a Suspense boundary.
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  const [isDraft, setIsDraft] = useState(false);
  useEffect(() => {
    setCopiedFrom(new URLSearchParams(window.location.search).get('copiedFrom'));
  }, []);

  useEffect(() => {
    fetch('/api/cities').then((r) => r.json()).then(setCities);
    fetch('/api/event-themes').then((r) => r.json()).then(setThemes);
    fetch('/api/admin/venues').then((r) => r.json()).then(setVenues);
    fetch('/api/admin/events').then((r) => r.json()).then((events: any[]) => {
      const e = events.find((ev) => ev.id === eventId);
      if (e) {
        setIsDraft(!!e.draft);
        setForm({
          name: e.name, description: e.description ?? '', photoUrl: e.photoUrl ?? '', themeId: e.themeId, cityId: e.cityId, venueId: e.venueId,
          startsAt: toDateTimeLocalValue(e.startsAt), ageMin: e.ageMin, ageMax: e.ageMax,
          maxMen: e.maxMen, maxWomen: e.maxWomen, cost: e.cost,
          expenses: e.expenses ?? '', visibility: e.visibility, confirmed: !!e.confirmed,
          fastmatchDiscounts: e.fastmatchDiscounts ?? true, groupDiscounts: e.groupDiscounts ?? true,
        });
      }
    });
  }, [eventId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotifyFailures([]);
    setSaving(true);
    const res = await fetch(`/api/admin/events/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        description: form.description || null,
        photoUrl: form.photoUrl || null,
        ageMin: Number(form.ageMin), ageMax: Number(form.ageMax),
        maxMen: Number(form.maxMen), maxWomen: Number(form.maxWomen),
        cost: Number(form.cost), expenses: form.expenses ? Number(form.expenses) : undefined,
        startsAt: fromDateTimeLocalValue(form.startsAt),
        // Saving this form is what takes a duplicated event out of draft.
        draft: false,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Please check your details.'); return; }
    // The event IS saved either way — stay on the page only to show who
    // didn't get their notification.
    if (Array.isArray(data.notifyFailures) && data.notifyFailures.length > 0) {
      setNotifyFailures(data.notifyFailures);
      return;
    }
    router.push(`/admin/events/${eventId}`);
  }

  if (!form) return <Loader label="Loading event…" />;

  return (
    <div className="mx-auto max-w-lg">
      <BackLink href={`/admin/events/${eventId}`}>Back to event</BackLink>
      <h1 className="mb-6 text-2xl font-extrabold text-ink">Edit event</h1>
      {isDraft && (
        <p className="mb-4 rounded-lg bg-amber/15 p-3 text-sm text-ink">
          <strong>{copiedFrom ? `This is a copy of event #${copiedFrom}, saved as a draft.` : 'This event is a draft.'}</strong>{' '}
          It isn&apos;t visible to the public or bookable until you save this form, so change the date and anything else first.
        </p>
      )}
      <Card>
        <form onSubmit={handleSave}>
          <Field label="Event type">
            <Select value={form.themeId} onChange={(e) => setForm({ ...form, themeId: e.target.value })}>
              {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Event name / description">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Event description">
            <textarea className="w-full rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-plum" rows={4}
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Shown to members on the event page, under the photo." />
          </Field>
          <PhotoUploadField value={form.photoUrl} onChange={(url) => setForm({ ...form, photoUrl: url })}
            hint="Optional. Shown at the top of the event page." />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date & time">
              <Input type="datetime-local" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            </Field>
            <Field label="City">
              <Select value={form.cityId} onChange={(e) => setForm({ ...form, cityId: e.target.value })}>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Venue">
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
            <Field label="Age min"><Input type="number" required value={form.ageMin} onChange={(e) => setForm({ ...form, ageMin: e.target.value })} /></Field>
            <Field label="Age max"><Input type="number" required value={form.ageMax} onChange={(e) => setForm({ ...form, ageMax: e.target.value })} /></Field>
          </div>
          <Field label="Cost ($)"><Input type="number" step="0.01" required value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max men"><Input type="number" value={form.maxMen} onChange={(e) => setForm({ ...form, maxMen: e.target.value })} /></Field>
            <Field label="Max women"><Input type="number" value={form.maxWomen} onChange={(e) => setForm({ ...form, maxWomen: e.target.value })} /></Field>
          </div>
          <Field label="Expenses ($)"><Input type="number" step="0.01" value={form.expenses} onChange={(e) => setForm({ ...form, expenses: e.target.value })} /></Field>

          <label className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" checked={form.visibility === 'PUBLIC'} onChange={(e) => setForm({ ...form, visibility: e.target.checked ? 'PUBLIC' : 'NOT_PUBLIC' })} />
            Visible to the public
          </label>
          <EventFlagFields value={form} onChange={(patch) => setForm({ ...form, ...patch })} />

          {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}
          {notifyFailures.length > 0 && (
            <div className="mb-4 rounded-lg bg-cream/60 p-3 text-sm">
              <p className="font-bold text-ink">Event saved, but {notifyFailures.length} notification{notifyFailures.length === 1 ? '' : 's'} couldn&apos;t be sent:</p>
              <ul className="mt-1 list-inside list-disc text-ink/70">
                {notifyFailures.map((f, i) => <li key={i}>{f.member} ({f.channel.toUpperCase()})</li>)}
              </ul>
              <p className="mt-1 text-ink/60">Please contact them directly about the new time.</p>
            </div>
          )}
          <Button type="submit" disabled={saving} loading={saving} className="w-full">{saving ? 'Saving…' : 'Save changes'}</Button>
        </form>
      </Card>
    </div>
  );
}
