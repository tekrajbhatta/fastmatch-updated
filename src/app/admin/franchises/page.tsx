'use client';

import { useState, useEffect } from 'react';
import { Field, Input, Button, Card, Badge, Loader } from '@/components/ui';

/**
 * Franchises (Gil, Nov): franchisees' logins. Each franchisee runs one or
 * more locations, and logs in with their email and password to the same
 * admin, limited to those locations: Events (and their bookings), Members
 * (search), Venues, Discount codes, Reports and My account. Their login only
 * works between the agreement's dates. src/lib/franchise.ts has the rules.
 */

interface Franchisee {
  id: string; name: string; email: string; mobile: string;
  cities: { id: string; name: string }[];
  agreementFrom: string; agreementTill: string;
  status: 'active' | 'not-started' | 'ended';
}
interface City { id: string; name: string }

const emptyForm = { name: '', email: '', mobile: '', cityIds: [] as string[], password: '', agreementFrom: '', agreementTill: '' };
type Form = typeof emptyForm;

/** "2026-12-01" as "01/12/2026", as the discount code pages show their dates. */
const day = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export default function AdminFranchisesPage() {
  const [franchisees, setFranchisees] = useState<Franchisee[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loaded, setLoaded] = useState(false);
  // The franchisee being changed; null for a new one.
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function load() {
    fetch('/api/admin/franchises').then((r) => r.json()).then((d) => {
      setFranchisees(Array.isArray(d) ? d : []);
      setLoaded(true);
    });
  }
  useEffect(() => {
    load();
    fetch('/api/cities').then((r) => r.json()).then((d) => setCities(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const open = (next: Form, id: string | null) => {
    setEditing(id); setForm(next); setError(null); setNotice(null); setShowForm(true);
    // The form opens above the list: bring it into view.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const formOf = (f: Franchisee): Form => ({
    name: f.name, email: f.email, mobile: f.mobile, cityIds: f.cities.map((c) => c.id), password: '',
    agreementFrom: f.agreementFrom, agreementTill: f.agreementTill,
  });
  const toggleCity = (id: string, on: boolean) =>
    setForm((f) => ({ ...f, cityIds: on ? [...f.cityIds, id] : f.cityIds.filter((c) => c !== id) }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = editing
      ? await fetch(`/api/admin/franchises/${editing}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).catch(() => null)
      : await fetch('/api/admin/franchises', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setSaving(false);
    if (!res) { setError('Could not reach the site. Please check your connection and try again.'); return; }
    if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Please check the franchisee’s details.'); return; }
    setShowForm(false);
    setNotice(editing
      ? `${data.name} is saved.${form.password ? ' Their new password works now, and they’re logged out everywhere else.' : ''}`
      : `${data.name} can now log in at fastmatch.com.au with ${data.email} and the password you chose. Please give them the password yourself: it isn’t emailed.`);
    load();
  }

  async function remove() {
    if (!editing || !confirm(`Delete ${form.name}'s franchise login? Their locations' events, venues and discount codes stay. This can't be undone.`)) return;
    setError(null);
    const res = await fetch(`/api/admin/franchises/${editing}`, { method: 'DELETE' }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) { setError(typeof data.error === 'string' ? data.error : 'Could not delete this franchisee.'); return; }
    setShowForm(false);
    setNotice(`${form.name}'s login is deleted. Their locations' events, venues and discount codes are still there.`);
    load();
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Franchises</h1>
          <p className="max-w-2xl text-sm text-ink/60">
            Franchisees log in with their email and password to the admin for their own locations only: Events (with bookings), Members
            (search), Venues, Discount codes, Reports and My account. Their login works only between the agreement&apos;s dates, and
            their reports cover only those dates.
          </p>
        </div>
        <Button onClick={() => open(emptyForm, null)} className="whitespace-nowrap">+ New franchisee</Button>
      </div>

      {notice && <p role="status" className="mb-4 rounded-lg bg-green/15 p-3 text-sm font-bold text-green-dark">{notice}</p>}

      {showForm && (
        <Card className="mb-6">
          <h2 className="mb-3 font-extrabold text-ink">{editing ? form.name || 'Franchisee' : 'New franchisee'}</h2>
          <form onSubmit={save}>
            <div className="grid gap-x-3 sm:grid-cols-2">
              <Field label="Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Mobile"><Input required type="tel" value={form.mobile} placeholder="0412 345 678" onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
              <Field label="Email (their login)"><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label={editing ? 'New password (leave empty to keep theirs)' : 'Password'}>
                <Input type="text" autoComplete="new-password" required={!editing} minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </Field>
              <p className="-mt-2 mb-3 text-xs text-ink/50 sm:col-span-2">
                At least 8 characters. Give it to them yourself: it isn&apos;t emailed. They can change it on My account. The email can&apos;t be
                one a member already uses: a franchisee&apos;s login is an account of its own.
              </p>
              <Field label="Agreement from"><Input type="date" required value={form.agreementFrom} onChange={(e) => setForm({ ...form, agreementFrom: e.target.value })} /></Field>
              <Field label="Agreement till"><Input type="date" required value={form.agreementTill} onChange={(e) => setForm({ ...form, agreementTill: e.target.value })} /></Field>
              <p className="-mt-2 mb-3 text-xs text-ink/50 sm:col-span-2">From 12:00 am on the first day to 11:59 pm on the last, Sydney time. Outside these dates they can&apos;t log in.</p>
            </div>
            <div className="mb-3">
              <p className="mb-1 text-sm font-bold text-ink">Locations</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
                {cities.map((c) => (
                  <label key={c.id} className="flex min-h-[32px] items-center gap-2 text-sm text-ink">
                    <input type="checkbox" checked={form.cityIds.includes(c.id)} onChange={(e) => toggleCity(c.id, e.target.checked)} />
                    {c.name}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink/50">
                They see and manage everything in these locations, what&apos;s there already included. A location has one franchisee at a time.
                Member emails about their events give their email address to write to.
              </p>
            </div>
            {error && <p role="alert" className="mb-3 text-sm font-medium text-coral">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving} loading={saving}>{editing ? 'Save changes' : 'Create franchisee'}</Button>
              {editing && <Button type="button" variant="ghost" onClick={remove}>Delete franchisee</Button>}
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
            {editing && (
              <p className="mt-3 text-xs text-ink/50">Deleting removes their login only: their locations&apos; events, venues and discount codes stay.</p>
            )}
          </form>
        </Card>
      )}

      {!loaded && <Loader label="Loading franchisees…" />}
      {loaded && franchisees.length === 0 && !showForm && (
        <p className="rounded-lg border border-ink/10 bg-white p-4 text-sm text-ink/60">No franchisees yet. Press &ldquo;+ New franchisee&rdquo; to add one.</p>
      )}
      <div className="space-y-2">
        {franchisees.map((f) => (
          <button key={f.id} onClick={() => open(formOf(f), f.id)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-ink/10 bg-white p-3 text-left hover:border-plum">
            <div className="min-w-0">
              <div className="font-extrabold text-ink">{f.name}</div>
              <div className="break-words text-xs text-ink/60">
                {f.cities.map((c) => c.name).join(', ')}
                <br /><span className="[overflow-wrap:anywhere]">{f.email}</span> · {f.mobile}
                <br />Agreement {day(f.agreementFrom)} to {day(f.agreementTill)}
              </div>
            </div>
            {f.status === 'ended' ? <Badge tone="muted">Ended</Badge>
              : f.status === 'not-started' ? <Badge tone="plum">Starts {day(f.agreementFrom)}</Badge>
                : <Badge tone="green">Active</Badge>}
          </button>
        ))}
      </div>
    </div>
  );
}
