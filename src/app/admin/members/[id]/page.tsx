'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, Badge, Button, Field, Input, Select } from '@/components/ui';
import { venueLine } from '@/lib/venue';

interface Booking {
  id: string; badge: number; status: string; paidAmount: string; checkedIn: boolean;
  event: { id: string; name: string; startsAt: string; venue: { name: string; address: string | null }; };
}
interface MemberDetail {
  id: string; name: string; email: string; mobile: string; gender: string;
  dateOfBirth: string; createdAt: string; agreedTerms: boolean; cityId: string;
  city: { name: string };
  bookings: Booking[];
  matches: { id: string; result: string; memberAId: string; memberBId: string }[];
}
interface City { id: string; name: string; }

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [cities, setCities] = useState<City[]>([]);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', mobile: '', gender: 'MALE', dateOfBirth: '', cityId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Two-step delete: the first click only arms the confirmation panel, which
  // spells out exactly what will be destroyed. A single misclick on a row
  // that has paid bookings behind it should never be enough.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/members/${id}`).then((r) => r.json()).then(setMember);
    fetch('/api/cities').then((r) => r.json()).then(setCities);
  }, [id]);

  function startEditing() {
    if (!member) return;
    setError(null);
    setSaved(false);
    setForm({
      name: member.name,
      email: member.email,
      mobile: member.mobile,
      gender: member.gender,
      // <input type="date"> needs YYYY-MM-DD, not a full ISO timestamp.
      dateOfBirth: member.dateOfBirth.slice(0, 10),
      cityId: member.cityId,
    });
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/admin/members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    // Surface the API's own message (e.g. "That email is already in use by
    // another member.") rather than a generic one.
    if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Please check the details.'); return; }
    // Re-fetch rather than patching state locally — the detail view shows
    // derived data (age, city name) the PATCH response doesn't include.
    const refreshed = await fetch(`/api/admin/members/${id}`).then((r) => r.json());
    setMember(refreshed);
    setEditing(false);
    setSaved(true);
  }

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    const res = await fetch(`/api/admin/members/${id}`, { method: 'DELETE' });
    const data = await res.json();
    setDeleting(false);
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Could not delete this member.');
      setConfirmingDelete(false);
      return;
    }
    router.push('/admin/members');
    router.refresh();
  }

  if (!member) return <p className="text-sm text-ink/50">Loading…</p>;

  const age = calculateAge(member.dateOfBirth);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-extrabold text-ink">{member.name}</h1>
      <p className="mb-6 text-sm text-ink/60">
        {member.email} · {member.mobile} · {member.city?.name} · {age} years old
        {!member.agreedTerms && <span className="ml-2 font-bold text-coral">— T&Cs not yet accepted</span>}
      </p>

      {saved && !editing && <p className="mb-4 text-sm font-bold text-green-dark">Member details updated.</p>}
      {error && !editing && !confirmingDelete && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}

      {editing && (
        <Card className="mb-6">
          <h2 className="mb-3 font-extrabold text-ink">Edit member</h2>
          <form onSubmit={handleSave}>
            <Field label="Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Mobile"><Input required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Gender">
                <Select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                  <option value="MALE">Male</option><option value="FEMALE">Female</option>
                </Select>
              </Field>
              <Field label="Date of birth">
                <Input type="date" required value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
              </Field>
            </div>
            <Field label="City">
              <Select value={form.cityId} onChange={(e) => setForm({ ...form, cityId: e.target.value })}>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
              <Button type="button" variant="ghost" onClick={() => { setEditing(false); setError(null); }}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="mb-6">
        <h2 className="mb-3 font-extrabold text-ink">Events attended ({member.bookings.length})</h2>
        {member.bookings.length === 0 && <p className="text-sm text-ink/40">No bookings yet.</p>}
        <div className="space-y-2">
          {member.bookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-lg bg-cream/40 p-3">
              <div>
                <div className="text-sm font-bold text-ink">{b.event.name}</div>
                <div className="text-xs text-ink/50">
                  {venueLine(b.event.venue)} · {new Date(b.event.startsAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} · Badge #{b.badge}
                </div>
              </div>
              <div className="flex gap-1.5">
                <Badge tone={b.status === 'CONFIRMED' ? 'green' : 'muted'}>{b.status === 'CONFIRMED' ? `Paid $${b.paidAmount}` : b.status}</Badge>
                {b.checkedIn && <Badge tone="plum">Checked in</Badge>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mb-6">
        <h2 className="mb-3 font-extrabold text-ink">Matches ({member.matches.length})</h2>
        {member.matches.length === 0 && <p className="text-sm text-ink/40">No matches yet.</p>}
        <div className="flex flex-wrap gap-2">
          {member.matches.map((m) => (
            <Badge key={m.id} tone={m.result === 'DATE' ? 'green' : 'plum'}>{m.result === 'DATE' ? 'Date match' : 'Friend match'}</Badge>
          ))}
        </div>
      </Card>

      {confirmingDelete && (
        <Card className="mb-6">
          <h2 className="mb-2 font-extrabold text-coral">Delete {member.name}?</h2>
          <p className="mb-3 text-sm text-ink/70">
            This permanently removes the member and cannot be undone.
            {member.bookings.length + member.matches.length > 0 ? (
              <>
                {' '}It will also delete{' '}
                <strong>
                  {member.bookings.length} booking{member.bookings.length === 1 ? '' : 's'} and{' '}
                  {member.matches.length} match{member.matches.length === 1 ? '' : 'es'}
                </strong>
                , along with any ratings they gave or received. Past bookings feed the revenue
                reports, so those totals will change.
              </>
            ) : (
              ' They have no bookings or matches, so nothing else is affected.'
            )}
          </p>
          {error && <p className="mb-3 text-sm font-medium text-coral">{error}</p>}
          <div className="flex gap-2">
            <Button variant="danger" disabled={deleting} onClick={handleDelete}>
              {deleting ? 'Deleting…' : 'Yes, delete permanently'}
            </Button>
            <Button variant="ghost" onClick={() => { setConfirmingDelete(false); setError(null); }}>Cancel</Button>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => router.push('/admin/members')}>Back to Members</Button>
        {!editing && <Button onClick={startEditing}>Edit member</Button>}
        {!confirmingDelete && <Button variant="danger" onClick={() => { setConfirmingDelete(true); setError(null); }}>Delete member</Button>}
      </div>
    </div>
  );
}

// Age is derived from dateOfBirth rather than stored, so it can never drift.
// Mirrors src/lib/age.ts, which the server-side 18+ and event age-range
// checks use — kept as a local copy because this is a client component.
function calculateAge(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}
