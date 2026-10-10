'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Field, Input, Select, Button, Card, BackLink } from '@/components/ui';
import PhotoUploadField from '@/components/PhotoUploadField';
import EventFlagFields from '@/components/EventFlagFields';
import VenueInfoPanel, { venueFillPatch } from '@/components/VenueInfoPanel';
import { fromDateTimeLocalValue } from '@/lib/datetime';
import { timeZoneForCity } from '@/lib/timezone';
import type { RatingAudience } from '@/lib/ratingAudience';
import { checkNewEvent, eventNumbers, EVENT_NUMBER_FIELDS, CHECK_FIELDS, type EventFieldErrors } from '@/lib/eventInput';

interface City { id: string; name: string; }
interface Theme { id: string; name: string; }
interface Venue { id: string; name: string; logoUrl: string | null; imageUrl: string | null; description: string | null; city: { id: string; name: string }; }

export default function NewEventPage() {
  const router = useRouter();
  const [cities, setCities] = useState<City[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [form, setForm] = useState({
    name: '', description: '', photoUrl: '', themeId: '', cityId: '', venueId: '', startsAt: '',
    ageMin: '', ageMax: '', maxMen: '12', maxWomen: '12', cost: '', expenses: '',
    visibility: 'PUBLIC' as 'PUBLIC' | 'NOT_PUBLIC',
    confirmed: false, fastmatchDiscounts: true, groupDiscounts: true,
    ratingAudience: 'OPPOSITE_GENDER' as RatingAudience,
  });
  const [repeatOn, setRepeatOn] = useState(false);
  const [repeat, setRepeat] = useState({ frequency: 'WEEKLY' as 'DAILY' | 'WEEKLY' | 'MONTHLY', interval: '1', endDate: '' });
  const [error, setError] = useState<string | null>(null);
  // What's wrong with each box, shown under it (src/lib/eventInput.ts).
  const [fieldErrors, setFieldErrors] = useState<EventFieldErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/cities').then((r) => r.json()).then((data) => {
      setCities(data);
      if (data.length) setForm((f) => ({ ...f, cityId: data[0].id }));
    });
    fetch('/api/event-themes').then((r) => r.json()).then((data) => {
      setThemes(data);
      if (data.length) setForm((f) => ({ ...f, themeId: data[0].id }));
    });
    fetch('/api/admin/venues').then((r) => r.json()).then(setVenues);
  }, []);

  // Venues belong to a city, so the dropdown only offers venues in the city
  // already chosen above — picking a Sydney venue for a Melbourne event
  // shouldn't be possible.
  const venuesInCity = venues.filter((v) => v.city.id === form.cityId);
  // The start time is typed on the event city's clock, whatever device it's
  // typed on: 7:00 pm for a Perth event means 7:00 pm in Perth.
  const cityName = cities.find((c) => c.id === form.cityId)?.name;

  // Changing the city can strand a venue selection that no longer belongs to
  // it; clear it rather than silently submitting a mismatched pair.
  function handleCityChange(cityId: string) {
    setForm((f) => {
      const stillValid = venues.some((v) => v.id === f.venueId && v.city.id === cityId);
      return { ...f, cityId, venueId: stillValid ? f.venueId : '' };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    // Converted here, in the browser, on the event city's clock. Posting the
    // raw datetime-local string made the SERVER parse it in ITS timezone.
    const startsAt = fromDateTimeLocalValue(form.startsAt, timeZoneForCity(cityName));
    const body = {
      ...form,
      ...eventNumbers(form, [...EVENT_NUMBER_FIELDS]),
      startsAt: startsAt ?? '',
      repeat: repeatOn ? { frequency: repeat.frequency, interval: Number(repeat.interval) || 1, endDate: repeat.endDate } : undefined,
    };
    // The same check the server makes, so each problem shows under its box.
    const checked = checkNewEvent(body);
    if (!checked.ok) { setFieldErrors(checked.fieldErrors); setError(CHECK_FIELDS); return; }
    setSaving(true);
    const res = await fetch('/api/admin/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setFieldErrors(data.fieldErrors ?? {});
      setError(typeof data.error === 'string' ? data.error : 'Please check your details.');
      return;
    }
    router.push('/admin/events');
  }
  const err = (k: string) => fieldErrors[k];

  return (
    <div className="mx-auto max-w-lg">
      <BackLink href="/admin/events">Back to events</BackLink>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">New event</h1>
      <p className="mb-6 text-sm text-ink/60">Event number assigns automatically.</p>

      <Card>
        <form onSubmit={handleSubmit}>
          <Field label="Event type" error={err('themeId')}>
            <Select value={form.themeId} onChange={(e) => setForm({ ...form, themeId: e.target.value })}>
              {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Event name / description" error={err('name')}>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ages 28–40, Sydney CBD" />
          </Field>
          <Field label="Event description">
            <textarea className="w-full rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-base outline-none sm:text-sm focus:border-plum" rows={4}
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Shown to members on the event page, under the photo." />
          </Field>
          <PhotoUploadField value={form.photoUrl} onChange={(url) => setForm((f) => ({ ...f, photoUrl: url }))}
            hint="Optional. Shown at the top of the event page." />
          {/* Bottom-aligned: the start label names the city's clock, and a
              long city name wraps it onto a second line. */}
          {/* One above the other on a phone: side by side, the date and time box was too narrow to read. */}
          <div className="grid items-end gap-x-3 sm:grid-cols-2">
            <Field label={`Start date & time (${cityName ?? 'event city'} time)`} error={err('startsAt')}>
              <Input type="datetime-local" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            </Field>
            <Field label="City" error={err('cityId')}>
              <Select value={form.cityId} onChange={(e) => handleCityChange(e.target.value)}>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Venue" error={err('venueId')}>
            <Select required value={form.venueId} onChange={(e) => {
              const venueId = e.target.value;
              // Pulls the venue's image and description into the event's own empty fields.
              setForm((f) => ({ ...f, venueId, ...venueFillPatch(f, venues.find((v) => v.id === venueId)) }));
            }}>
              <option value="">Select a venue…</option>
              {venuesInCity.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
            {/* Venues are picked from the directory, never typed. Without this
                note an empty dropdown looks like a bug rather than "you have
                not added a venue in this city yet". */}
            <p className="mt-1 text-xs text-ink/50">
              {venuesInCity.length === 0
                ? 'No venues in this city yet, so '
                : 'Somewhere new? '}
              <Link href="/admin/venues" className="font-bold text-plum hover:underline">add a venue</Link> first.
            </p>
            <VenueInfoPanel venue={venues.find((v) => v.id === form.venueId)} photoUrl={form.photoUrl} description={form.description}
              onUse={(patch) => setForm((f) => ({ ...f, ...patch }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Age min" error={err('ageMin')}>
              <Input type="number" required value={form.ageMin} onChange={(e) => setForm({ ...form, ageMin: e.target.value })} placeholder="28" />
            </Field>
            <Field label="Age max" error={err('ageMax')}>
              <Input type="number" required value={form.ageMax} onChange={(e) => setForm({ ...form, ageMax: e.target.value })} placeholder="40" />
            </Field>
          </div>
          <Field label="Cost ($)" error={err('cost')}>
            <Input type="number" step="0.01" required value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="49.00" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max men" error={err('maxMen')}>
              <Input type="number" value={form.maxMen} onChange={(e) => setForm({ ...form, maxMen: e.target.value })} />
            </Field>
            <Field label="Max women" error={err('maxWomen')}>
              <Input type="number" value={form.maxWomen} onChange={(e) => setForm({ ...form, maxWomen: e.target.value })} />
            </Field>
          </div>
          <Field label="Expenses ($)" error={err('expenses')}>
            <Input type="number" step="0.01" value={form.expenses} onChange={(e) => setForm({ ...form, expenses: e.target.value })} placeholder="Optional" />
          </Field>

          <label className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" checked={form.visibility === 'PUBLIC'} onChange={(e) => setForm({ ...form, visibility: e.target.checked ? 'PUBLIC' : 'NOT_PUBLIC' })} />
            Visible to the public
          </label>
          <EventFlagFields value={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />

          <div className="mb-4 rounded-lg bg-cream/40 p-4">
            <label className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
              <input type="checkbox" checked={repeatOn} onChange={(e) => setRepeatOn(e.target.checked)} />
              Repeat this event
            </label>
            {repeatOn && (
              <div className="grid grid-cols-2 gap-3">
                <Select value={repeat.frequency} onChange={(e) => setRepeat({ ...repeat, frequency: e.target.value as any })}>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                </Select>
                <Input type="number" min={1} value={repeat.interval} onChange={(e) => setRepeat({ ...repeat, interval: e.target.value })} placeholder="Every N" />
                <div className="col-span-2">
                  <Field label="Ends" error={err('repeat.endDate') ?? err('repeat.interval')}><Input type="date" required={repeatOn} value={repeat.endDate} onChange={(e) => setRepeat({ ...repeat, endDate: e.target.value })} /></Field>
                </div>
              </div>
            )}
          </div>

          {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}

          <Button type="submit" disabled={saving} loading={saving} className="w-full">{saving ? 'Creating…' : 'Create event'}</Button>
        </form>
      </Card>
    </div>
  );
}
