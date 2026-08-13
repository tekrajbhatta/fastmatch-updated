'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Field, Input, Select, Button, Card } from '@/components/ui';

interface City { id: string; name: string; }

export default function EditProfilePage() {
  const router = useRouter();
  const [cities, setCities] = useState<City[]>([]);
  const [form, setForm] = useState({ name: '', mobile: '', cityId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/cities').then((r) => r.json()).then(setCities);
    fetch('/api/account/profile').then((r) => r.json()).then((m) => {
      setForm({ name: m.name, mobile: m.mobile, cityId: m.cityId });
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch('/api/account/profile', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) { setError('Please check your details.'); return; }
    setSaved(true);
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-extrabold text-ink">Edit profile</h1>
      <Card>
        <form onSubmit={handleSave}>
          <Field label="Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Mobile"><Input required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
          <Field label="City">
            <Select value={form.cityId} onChange={(e) => setForm({ ...form, cityId: e.target.value })}>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}
          {saved && <p className="mb-4 text-sm font-bold text-green-dark">Profile updated.</p>}
          <Button type="submit" disabled={saving} className="w-full">{saving ? 'Saving…' : 'Save changes'}</Button>
        </form>
      </Card>
      <Button variant="ghost" onClick={() => router.push('/account')} className="mt-3 w-full">Back to account</Button>
    </div>
  );
}
