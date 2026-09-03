'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Field, Input, Select, Button, Card } from '@/components/ui';
import { fromDateTimeLocalValue } from '@/lib/datetime';

interface City { id: string; name: string; }
interface Theme { id: string; name: string; }
interface Venue { id: string; name: string; city: { id: string; name: string }; }

export default function NewEventPage() {
  const router = useRouter();
  const [cities, setCities] = useState<City[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [form, setForm] = useState({
    name: '', description: '', themeId: '', cityId: '', venueId: '', startsAt: '',
    ageMin: '', ageMax: '', maxMen: '12', maxWomen: '12', cost: '', expenses: '',
    visibility: 'PUBLIC' as 'PUBLIC' | 'NOT_PUBLIC',
  });
  const [repeatOn, setRepeatOn] = useState(false);
  const [repeat, setRepeat] = useState({ frequency: 'WEEKLY' as 'DAILY' | 'WEEKLY' | 'MONTHLY', interval: '1', endDate: '' });
  const [error, setError] = useState<string | null>(null);
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
    setSaving(true);
    const res = await fetch('/api/admin/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        // Converted here, in the browser. Posting the raw datetime-local
        // string made the SERVER parse it in ITS timezone, not the admin's.
        startsAt: fromDateTimeLocalValue(form.startsAt),
        ageMin: Number(form.ageMin),
        ageMax: Number(form.ageMax),
        maxMen: Number(form.maxMen),
        maxWomen: Number(form.maxWomen),
        cost: Number(form.cost),
        expenses: form.expenses ? Number(form.expenses) : undefined,
        repeat: repeatOn ? { frequency: repeat.frequency, interval: Number(repeat.interval), endDate: repeat.endDate } : undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Please check your details.');
      return;
    }
    router.push('/admin/events');
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-2xl font-extrabold text-ink">New event</h1>
      <p className="mb-6 text-sm text-ink/60">Event number assigns automatically.</p>

      <Card>
        <form onSubmit={handleSubmit}>
          <Field label="Event theme">
            <Select value={form.themeId} onChange={(e) => setForm({ ...form, themeId: e.target.value })}>
              {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Event name / description">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ages 28–40, Sydney CBD" />
          </Field>
          <Field label="Event description">
            <textarea className="w-full rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-plum" rows={4}
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Shown to members on the event page, under the Book button." />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date & time">
              <Input type="datetime-local" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            </Field>
            <Field label="City">
              <Select value={form.cityId} onChange={(e) => handleCityChange(e.target.value)}>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Venue">
            <Select required value={form.venueId} onChange={(e) => setForm({ ...form, venueId: e.target.value })}>
              <option value="">Select a venue…</option>
              {venuesInCity.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
            {/* Venues are picked from the directory, never typed. Without this
                note an empty dropdown looks like a bug rather than "you have
                not added a venue in this city yet". */}
            <p className="mt-1 text-xs text-ink/50">
              {venuesInCity.length === 0
                ? 'No venues in this city yet — '
                : 'Somewhere new? '}
              <Link href="/admin/venues" className="font-bold text-plum hover:underline">add a venue</Link> first.
            </p>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Age min">
              <Input type="number" required value={form.ageMin} onChange={(e) => setForm({ ...form, ageMin: e.target.value })} placeholder="28" />
            </Field>
            <Field label="Age max">
              <Input type="number" required value={form.ageMax} onChange={(e) => setForm({ ...form, ageMax: e.target.value })} placeholder="40" />
            </Field>
          </div>
          <Field label="Cost ($)">
            <Input type="number" step="0.01" required value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="49.00" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max men">
              <Input type="number" value={form.maxMen} onChange={(e) => setForm({ ...form, maxMen: e.target.value })} />
            </Field>
            <Field label="Max women">
              <Input type="number" value={form.maxWomen} onChange={(e) => setForm({ ...form, maxWomen: e.target.value })} />
            </Field>
          </div>
          <Field label="Expenses ($)">
            <Input type="number" step="0.01" value={form.expenses} onChange={(e) => setForm({ ...form, expenses: e.target.value })} placeholder="Optional" />
          </Field>

          <label className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" checked={form.visibility === 'PUBLIC'} onChange={(e) => setForm({ ...form, visibility: e.target.checked ? 'PUBLIC' : 'NOT_PUBLIC' })} />
            Visible to the public
          </label>

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
                  <Field label="Ends"><Input type="date" required={repeatOn} value={repeat.endDate} onChange={(e) => setRepeat({ ...repeat, endDate: e.target.value })} /></Field>
                </div>
              </div>
            )}
          </div>

          {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}

          <Button type="submit" disabled={saving} className="w-full">{saving ? 'Creating…' : 'Create event'}</Button>
        </form>
      </Card>
    </div>
  );
}
