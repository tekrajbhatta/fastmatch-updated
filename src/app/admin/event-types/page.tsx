'use client';

import { useState, useEffect } from 'react';
import { Field, Input, Button, Card, Badge, Loader } from '@/components/ui';
import Modal from '@/components/Modal';

// The event types offered by the "Event type" dropdown on the event forms
// (the old admin's Setup > Event Types). One field each: the name.
interface EventType { id: string; name: string; _count: { events: number } }

export default function AdminEventTypesPage() {
  const [types, setTypes] = useState<EventType[]>([]);
  // False until the first fetch returns, so the list doesn't claim to be empty while loading.
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<EventType | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    fetch('/api/admin/event-types').then((r) => r.json()).then((d) => { setTypes(d); setLoaded(true); });
  }
  useEffect(() => { load(); }, []);

  function startCreate() {
    setEditingId(null);
    setName('');
    setError(null);
    setConfirmDelete(null);
    setOpen(true);
  }

  function startEdit(t: EventType) {
    setEditingId(t.id);
    setName(t.name);
    setError(null);
    setConfirmDelete(null);
    setOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function close() {
    setOpen(false);
    setEditingId(null);
    setError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch(editingId ? `/api/admin/event-types/${editingId}` : '/api/admin/event-types', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    setSaving(false);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) { setError(typeof data.error === 'string' ? data.error : 'Could not save the event type.'); return; }
    close();
    load();
  }

  async function handleDelete(t: EventType) {
    setError(null);
    setDeleting(true);
    const res = await fetch(`/api/admin/event-types/${t.id}`, { method: 'DELETE' }).catch(() => null);
    setDeleting(false);
    setConfirmDelete(null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) { setError(typeof data.error === 'string' ? data.error : 'Could not delete that event type.'); return; }
    load();
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="mb-1 text-2xl font-extrabold text-ink">Event Types</h1>
          <p className="text-sm text-ink/60">Add an event type here, then pick it as the &quot;Event type&quot; when creating or editing an event.</p>
          <p className="text-sm text-ink/60">An event type already used by an event can&apos;t be deleted, but it can be renamed.</p>
        </div>
        {!open && <Button onClick={startCreate} className="shrink-0 whitespace-nowrap">+ New event type</Button>}
      </div>

      {error && !open && <p role="alert" className="mb-4 text-sm font-medium text-coral">{error}</p>}

      {open && (
        <Card className="mb-6">
          <h2 className="mb-3 font-extrabold text-ink">{editingId ? 'Edit event type' : 'New event type'}</h2>
          <form onSubmit={handleSave}>
            <Field label="Event type">
              <Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Professionals speed dating" autoFocus />
            </Field>
            {editingId && (
              <p className="-mt-2 mb-4 text-xs text-ink/50">Renaming changes the name on every event of this type, past and upcoming.</p>
            )}
            {error && <p role="alert" className="mb-4 text-sm font-medium text-coral">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving} loading={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create event type'}</Button>
              <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Over the page, so it shows beside the Delete that was pressed, however far down the list. */}
      {confirmDelete && (
        <Modal title="Delete this event type?" onClose={() => setConfirmDelete(null)} busy={deleting}>
          <p className="mb-4 text-sm text-ink/70">
            Delete <strong>{confirmDelete.name}</strong>? This can&apos;t be undone.
          </p>
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => handleDelete(confirmDelete)} disabled={deleting} loading={deleting} className="flex-1 sm:flex-none">Yes, delete</Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={deleting} className="flex-1 sm:flex-none">Cancel</Button>
          </div>
        </Modal>
      )}

      {!loaded ? (
        <Loader label="Loading event types…" />
      ) : types.length === 0 ? (
        <Card><p className="text-sm text-ink/50">No event types yet. Create one to start adding events.</p></Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream/50 text-left text-xs font-bold uppercase text-ink/50">
              <tr><th className="px-4 py-3">Event type</th><th className="px-4 py-3">Events</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id} className="border-t border-ink/5">
                  <td className="px-4 py-3 font-bold text-ink">{t.name}</td>
                  <td className="px-4 py-3"><Badge tone={t._count.events > 0 ? 'green' : 'muted'}>{t._count.events}</Badge></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button onClick={() => startEdit(t)} className="text-sm font-bold text-plum hover:underline">Edit</button>
                    {/* A type an event uses can't be deleted (the API refuses);
                        hiding the button avoids offering an action that can
                        only fail, as on Venues. */}
                    {t._count.events === 0 && (
                      <button onClick={() => { setConfirmDelete(t); setError(null); }} className="ml-3 text-sm font-bold text-coral hover:underline">Delete</button>
                    )}
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
