'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FormCard, LoadingNote, SplitLayout } from '@/components/site/layout';
import { Button, linkClass } from '@/components/site/button';
import { Field, FormError, FormSuccess, SelectInput, TextInput } from '@/components/site/form';
import { latestAdultDateOfBirth } from '@/lib/age';
import { NETWORK_ERROR } from '@/lib/networkError';
import SessionExpired from '@/components/site/SessionExpired';
import LoadFailed from '@/components/site/LoadFailed';

interface City { id: string; name: string; }

export default function EditProfilePage() {
  const router = useRouter();
  const [cities, setCities] = useState<City[]>([]);
  const [form, setForm] = useState({ name: '', email: '', mobile: '', cityId: '', dateOfBirth: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Where the link to confirm a new address went (the address itself only
  // changes when it's clicked).
  const [emailChangePending, setEmailChangePending] = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState('');
  // A new mobile needs its code entering before the member can book again.
  const [mobileChange, setMobileChange] = useState<{ smsSent: boolean } | null>(null);
  // The form waits for the member's current details: shown empty, anything
  // typed before they arrived was overwritten when they did.
  const [loaded, setLoaded] = useState(false);
  // Not logged in any more, or the site couldn't be reached: said, rather
  // than the form shown with every field empty.
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    fetch('/api/cities').then((r) => r.json()).then(setCities).catch(() => {});
    fetch('/api/account/profile').then(async (r) => {
      if (r.status === 401) { setNeedsLogin(true); return; }
      if (!r.ok) { setLoadFailed(true); return; }
      const m = await r.json();
      // Stored as UTC midnight, so the first 10 characters are the date itself.
      setForm({ name: m.name, email: m.email, mobile: m.mobile, cityId: m.cityId, dateOfBirth: m.dateOfBirth ? String(m.dateOfBirth).slice(0, 10) : '' });
      setCurrentEmail(m.email);
      setLoaded(true);
    }).catch(() => setLoadFailed(true));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch('/api/account/profile', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    }).catch(() => null);
    setSaving(false);
    if (!res) { setError(NETWORK_ERROR); return; }
    if (res.status === 401) { setNeedsLogin(true); return; }
    const data = await res.json().catch(() => ({}));
    // Surface the API's own message rather than a generic one.
    if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Please check your details.'); return; }
    setSaved(true);
    setEmailChangePending(data.emailChangePending ?? null);
    setMobileChange(data.mobileChangePending ? { smsSent: data.smsSent !== false } : null);
    // The account still has its current address until the link is clicked.
    if (data.emailChangePending) setForm((f) => ({ ...f, email: currentEmail }));
  }

  // Nobody under 18.
  // Someone turning 18 today (in Sydney, as the server checks it) can pick their birthday.
  const maxDob = latestAdultDateOfBirth();

  return (
    <SplitLayout title="Edit profile" back={{ href: '/account', label: 'Back to my account' }}>
      <FormCard>
        {needsLogin ? <SessionExpired next="/account/edit-profile" /> : loadFailed ? <LoadFailed /> : !loaded ? <LoadingNote>Loading your details…</LoadingNote> : (
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
              Profile updated.
              {emailChangePending && (
                <> We&apos;ve sent a link to {emailChangePending}. Your email address changes when you click it; until then it stays {currentEmail}.</>
              )}
              {mobileChange && (
                <>
                  {' '}{mobileChange.smsSent ? 'We\'ve texted a code to your new mobile.' : 'We couldn\'t text a code to your new mobile just now.'}{' '}
                  Please confirm it before you book: <Link href={mobileChange.smsSent ? '/verify-mobile' : '/verify-mobile?smsFailed=1'} className={linkClass}>enter the code</Link>.
                </>
              )}
            </FormSuccess>
          )}
          <Button type="submit" disabled={saving} loading={saving} block className="mt-1">{saving ? 'Saving…' : 'Save changes'}</Button>
        </form>
        )}
        <Button variant="secondary" onClick={() => router.push('/account')} block>Back to account</Button>
      </FormCard>
    </SplitLayout>
  );
}
