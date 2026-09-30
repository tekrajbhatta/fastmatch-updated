'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FormCard, SplitLayout } from '@/components/site/layout';
import { Button } from '@/components/site/button';
import { Field, FormError, FormSuccess, SelectInput, TextInput } from '@/components/site/form';

interface City { id: string; name: string; }

export default function EditProfilePage() {
  const router = useRouter();
  const [cities, setCities] = useState<City[]>([]);
  const [form, setForm] = useState({ name: '', email: '', mobile: '', cityId: '', dateOfBirth: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [emailChanged, setEmailChanged] = useState(false);

  useEffect(() => {
    fetch('/api/cities').then((r) => r.json()).then(setCities);
    fetch('/api/account/profile').then((r) => r.json()).then((m) => {
      // Stored as UTC midnight, so the first 10 characters are the date itself.
      setForm({ name: m.name, email: m.email, mobile: m.mobile, cityId: m.cityId, dateOfBirth: m.dateOfBirth ? String(m.dateOfBirth).slice(0, 10) : '' });
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

  // Nobody under 18.
  const maxDob = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().slice(0, 10); })();

  return (
    <SplitLayout title="Edit profile">
      <FormCard>
        <form onSubmit={handleSave} className="flex flex-col gap-5">
          <Field label="Name"><TextInput required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email"><TextInput type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          {/* Side by side when there's room, as on sign up. */}
          <div className="flex flex-wrap gap-x-3.5 gap-y-5">
            <Field label="Mobile" className="flex-[1_1_150px]">
              <TextInput required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </Field>
            {/* Your age on the site — for suggested events and age ranges — is
                worked out from this, so it's always current. */}
            <Field label="Date of birth" className="flex-[1_1_150px]">
              <TextInput type="date" required max={maxDob} value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
            </Field>
          </div>
          <Field label="City">
            <SelectInput value={form.cityId} onChange={(e) => setForm({ ...form, cityId: e.target.value })}>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectInput>
          </Field>
          {error && <FormError>{error}</FormError>}
          {saved && (
            <FormSuccess>
              Profile updated.{emailChanged ? ' Check your new email for a link to verify it — booking is paused until you do.' : ''}
            </FormSuccess>
          )}
          <Button type="submit" disabled={saving} block className="mt-1">{saving ? 'Saving…' : 'Save changes'}</Button>
        </form>
        <Button variant="secondary" onClick={() => router.push('/account')} block>Back to account</Button>
      </FormCard>
    </SplitLayout>
  );
}
