'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Field, Input, Select, Button, Card } from '@/components/ui';

interface City { id: string; name: string; }

export default function EditProfilePage() {
  const router = useRouter();
  const [cities, setCities] = useState<City[]>([]);
  const [form, setForm] = useState({ name: '', email: '', mobile: '', cityId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [emailChanged, setEmailChanged] = useState(false);

  useEffect(() => {
    fetch('/api/cities').then((r) => r.json()).then(setCities);
    fetch('/api/account/profile').then((r) => r.json()).then((m) => {
      setForm({ name: m.name, email: m.email, mobile: m.mobile, cityId: m.cityId });
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch('/api/account/profile', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    // Surface the API's own message (e.g. "That email is already in use by
    // another account.") rather than a generic one.
    if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Please check your details.'); return; }
    setSaved(true);
    setEmailChanged(!!data.emailChanged);
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-extrabold text-ink">Edit profile</h1>
      <Card>
        <form onSubmit={handleSave}>
          <Field label="Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Mobile"><Input required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
          <Field label="City">
            <Select value={form.cityId} onChange={(e) => setForm({ ...form, cityId: e.target.value })}>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}
          {saved && (
            <p className="mb-4 text-sm font-bold text-green-dark">
              Profile updated.{emailChanged ? ' Check your new email for a link to verify it — booking is paused until you do.' : ''}
            </p>
          )}
          <Button type="submit" disabled={saving} className="w-full">{saving ? 'Saving…' : 'Save changes'}</Button>
        </form>
      </Card>
      <Button variant="ghost" onClick={() => router.push('/account')} className="mt-3 w-full">Back to account</Button>
    </div>
  );
}
