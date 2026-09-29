'use client';

import { useState, useEffect } from 'react';
import { Field, Input, Select, Button, Card, Badge } from '@/components/ui';
import PhotoUploadField from '@/components/PhotoUploadField';

interface City { id: string; name: string; }
interface Venue {
  id: string; name: string; address: string | null; phone: string | null;
  websiteUrl: string | null; logoUrl: string | null; imageUrl: string | null; description: string | null;
  city: { id: string; name: string };
  _count: { events: number };
}

const EMPTY = { name: '', cityId: '', address: '', phone: '', websiteUrl: '', logoUrl: '', imageUrl: '', description: '' };

export default function AdminVenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Venue | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);

  function load() {
    return fetch('/api/admin/venues').then((r) => r.json()).then(setVenues);
  }

  useEffect(() => {
    load();
    fetch('/api/cities').then((r) => r.json()).then((data: City[]) => {
      setCities(data);
      setForm((f) => (f.cityId ? f : { ...f, cityId: data[0]?.id ?? '' }));
    });
  }, []);

  function startCreate() {
    setEditingId(null);
    setForm({ ...EMPTY, cityId: cities[0]?.id ?? '' });
    setError(null);
    setNotice(null);
    setOpen(true);
  }

  function startEdit(v: Venue) {
    setEditingId(v.id);
    setForm({
      name: v.name, cityId: v.city.id, address: v.address ?? '',
      phone: v.phone ?? '', websiteUrl: v.websiteUrl ?? '',
      logoUrl: v.logoUrl ?? '', imageUrl: v.imageUrl ?? '', description: v.description ?? '',
    });
    setError(null);
    setOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch(editingId ? `/api/admin/venues/${editingId}` : '/api/admin/venues', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    // Surface the API's own message (e.g. "GG Bar already exists in Sydney.")
    if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Please check the venue details.'); return; }
    setOpen(false);
    setEditingId(null);
    setNotice(null);
    load();
  }

  async function handleDelete(v: Venue) {
    setError(null);
    const res = await fetch(`/api/admin/venues/${v.id}`, { method: 'DELETE' });
    const data = await res.json();
    setConfirmDelete(null);
    if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Could not delete that venue.'); return; }
    load();
  }

  // Copies every field, then opens the copy for editing — rename it and save.
  async function handleDuplicate(v: Venue) {
    setError(null);
    setDuplicating(v.id);
    const res = await fetch(`/api/admin/venues/${v.id}/duplicate`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setDuplicating(null);
    if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Could not duplicate that venue.'); return; }
    await load();
    startEdit(data);
    setNotice(`Copy of ${v.name} created — give it its own name and save.`);
  }

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-extrabold text-ink">Venues</h1>
          <p className="text-sm text-ink/60">Add a venue here, then pick it when creating an event or a blast — its image and description are copied in, ready to edit.</p>
          <p className="text-sm text-ink/60">The venues that are already in use by an event can not be deleted.</p>
        </div>
        {!open && <Button onClick={startCreate}>Create venue</Button>}
      </div>

      {error && !open && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}

      {open && (
        <Card className="mb-6">
          <h2 className="mb-3 font-extrabold text-ink">{editingId ? 'Edit venue' : 'Create venue'}</h2>
          {notice && <p className="mb-3 rounded-lg bg-green/15 p-3 text-sm font-bold text-green-dark">{notice}</p>}
          <form onSubmit={handleSave}>
            <Field label="Venue name">
              <Input required value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="GG Bar" />
            </Field>
            <Field label="City">
              <Select required value={form.cityId} onChange={(e) => set({ cityId: e.target.value })}>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Address">
              <Input value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder="23 Walker St, North Sydney" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="(02) 9955 1234" />
              </Field>
              <Field label="Website">
                <Input value={form.websiteUrl} onChange={(e) => set({ websiteUrl: e.target.value })} placeholder="ggbar.com.au" />
              </Field>
            </div>
            <Field label="Description">
              <textarea
                rows={4}
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
                placeholder="A few words about the venue — the setting, the drinks, how to find it."
                className="w-full rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-plum"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <PhotoUploadField label="Venue logo" value={form.logoUrl} onChange={(url) => set({ logoUrl: url })} hint="Optional." />
              <PhotoUploadField label="Venue image" value={form.imageUrl} onChange={(url) => set({ imageUrl: url })}
                hint="Optional. Used as the photo when this venue is picked for an event or blast." />
            </div>

            {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create venue'}</Button>
              <Button type="button" variant="ghost" onClick={() => { setOpen(false); setEditingId(null); setError(null); setNotice(null); }}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {confirmDelete && (
        <Card className="mb-6">
          <p className="mb-3 text-sm text-ink/70">
            Delete <strong>{confirmDelete.name}</strong>? This can&apos;t be undone.
          </p>
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => handleDelete(confirmDelete)}>Yes, delete</Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          </div>
        </Card>
      )}

      {venues.length === 0 ? (
        <Card><p className="text-sm text-ink/50">No venues yet. Create one to start adding events.</p></Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream/50 text-left text-xs font-bold uppercase text-ink/50">
              <tr>
                <th className="px-4 py-3">Venue</th><th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Address</th><th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Events</th><th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {venues.map((v) => (
                <tr key={v.id} className="border-t border-ink/5">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {(v.logoUrl || v.imageUrl) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={(v.logoUrl || v.imageUrl)!} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                      )}
                      <span className="font-bold text-ink">{v.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink/60">{v.city.name}</td>
                  <td className="px-4 py-3 text-ink/60">{v.address ?? <span className="text-ink/30">—</span>}</td>
                  <td className="px-4 py-3 text-ink/60">
                    {v.phone ?? ''}{v.phone && v.websiteUrl ? ' · ' : ''}{v.websiteUrl ?? ''}
                    {!v.phone && !v.websiteUrl && <span className="text-ink/30">—</span>}
                  </td>
                  <td className="px-4 py-3"><Badge tone={v._count.events > 0 ? 'green' : 'muted'}>{v._count.events}</Badge></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button onClick={() => startEdit(v)} className="text-sm font-bold text-plum hover:underline">Edit</button>
                    {/* Deleting a venue an event uses is refused by the API;
                        hiding the button avoids offering an action that can
                        only fail. */}
                    {v._count.events === 0 && (
                      <button onClick={() => setConfirmDelete(v)} className="ml-3 text-sm font-bold text-coral hover:underline">Delete</button>
                    )}
                    <button onClick={() => handleDuplicate(v)} disabled={duplicating !== null} className="ml-3 text-sm font-bold text-plum hover:underline disabled:opacity-50">
                      {duplicating === v.id ? 'Duplicating…' : 'Duplicate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
