'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { SplitLayout, FormCard, LoadingNote } from '@/components/site/layout';
import { Field, TextInput, SelectInput, Checkbox, FormError, FormSuccess } from '@/components/site/form';
import { Button, linkClass } from '@/components/site/button';
import { latestAdultDateOfBirth } from '@/lib/age';

interface Prefill {
  name: string; email: string; mobile: string; gender: 'MALE' | 'FEMALE'; cityId: string;
  dateOfBirth: string | null; canChangeGender: boolean; invitedBy: string | null;
}
interface City { id: string; name: string }

/**
 * Where the "Set your password" button lands for someone another member put
 * on FastMatch — a friend booked into an event, or a "Tell A Friend" invitee.
 * Their registration, worded as a welcome: password, then the profile details
 * someone else typed for them, checked and completed by them.
 */
function SetPasswordInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [form, setForm] = useState({
    password: '', confirm: '', name: '', mobile: '', dateOfBirth: '', cityId: '',
    gender: 'MALE' as 'MALE' | 'FEMALE', marketingOptIn: true, agreedTerms: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle');

  useEffect(() => {
    fetch('/api/cities').then((r) => r.json()).then(setCities).catch(() => {});
    if (!token) { setLinkError('This link is incomplete. Please use the button in your email.'); return; }
    fetch(`/api/auth/set-password?token=${encodeURIComponent(token)}`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setLinkError(typeof d.error === 'string' ? d.error : 'This link is invalid or has expired.'); return; }
      setPrefill(d);
      setForm((f) => ({ ...f, name: d.name, mobile: d.mobile, dateOfBirth: d.dateOfBirth ?? '', cityId: d.cityId, gender: d.gender }));
    });
  }, [token]);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) { setError("The two passwords don't match."); return; }
    setStatus('saving');
    const { confirm, gender, ...rest } = form;
    const res = await fetch('/api/auth/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...rest, ...(prefill?.canChangeGender ? { gender } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'This link may have expired.');
      setStatus('idle');
      return;
    }
    setStatus('done');
    // Logged in by the API. Next stop is confirming their mobile, exactly as
    // after registering — they need it to book an event themselves.
    const next = data.mobileVerified ? '/events' : data.smsSent === false ? '/verify-mobile?smsFailed=1' : '/verify-mobile';
    setTimeout(() => router.push(next), 1500);
  }

  // No future dates, and nobody under 18.
  // Someone turning 18 today (in Sydney, as the server checks it) can pick their birthday.
  const maxDob = latestAdultDateOfBirth();

  return (
    <SplitLayout
      title="Welcome to FastMatch"
      lead={
        <>
          {prefill?.invitedBy ? <><strong className="text-white">{prefill.invitedBy}</strong> registered you with FastMatch. </> : null}
          Choose a password and check your details. You&apos;ll log in with your email to book events, check in on the
          night and see your matches.
        </>
      }
      stickyIntro
    >
      <FormCard>
        {linkError ? (
          <FormError>
            {linkError} <Link href="/forgot-password" className={linkClass}>Get a new link</Link>
          </FormError>
        ) : !prefill ? (
          <LoadingNote>Loading…</LoadingNote>
        ) : status === 'done' ? (
          <FormSuccess>All set, you&apos;re logged in. One last step: confirming your mobile…</FormSuccess>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-[22px]">
            <Field label="Email"><TextInput value={prefill.email} disabled /></Field>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-x-3.5 gap-y-[22px]">
                <Field label="Password" className="flex-[1_1_150px]">
                  <TextInput type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => set({ password: e.target.value })} aria-describedby="password-hint" />
                </Field>
                <Field label="Confirm password" className="flex-[1_1_150px]">
                  <TextInput type="password" required minLength={8} autoComplete="new-password" value={form.confirm} onChange={(e) => set({ confirm: e.target.value })} aria-describedby="password-hint" />
                </Field>
              </div>
              <p id="password-hint" className="text-sm leading-snug text-ink-600">At least 8 characters.</p>
            </div>

            <h2 className="mt-1 border-t border-line pt-6 font-display text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-ink-900">Your details</h2>
            <Field label="Name"><TextInput required value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <div className="flex flex-wrap gap-x-3.5 gap-y-[22px]">
              <Field label="Mobile" className="flex-[1_1_150px]"><TextInput type="tel" required value={form.mobile} onChange={(e) => set({ mobile: e.target.value })} /></Field>
              <Field label="Date of birth" className="flex-[1_1_150px]"><TextInput type="date" required max={maxDob} value={form.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value })} /></Field>
            </div>
            <div className="flex flex-wrap gap-x-3.5 gap-y-[22px]">
              <Field label="City" className="flex-[1_1_150px]">
                <SelectInput required value={form.cityId} onChange={(e) => set({ cityId: e.target.value })}>
                  {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectInput>
              </Field>
              <Field label="Gender" className="flex-[1_1_150px]">
                {prefill.canChangeGender ? (
                  <SelectInput value={form.gender} onChange={(e) => set({ gender: e.target.value as 'MALE' | 'FEMALE' })}>
                    <option value="MALE">Male</option><option value="FEMALE">Female</option>
                  </SelectInput>
                ) : (
                  <TextInput value={form.gender === 'MALE' ? 'Male' : 'Female'} disabled />
                )}
              </Field>
            </div>

            <div className="flex flex-col gap-4">
              <Checkbox checked={form.marketingOptIn} onChange={(e) => set({ marketingOptIn: e.target.checked })}>
                Email and text me about upcoming FastMatch events and offers. You can unsubscribe any time.
              </Checkbox>
              {/* Same agreement as the registration form. */}
              <Checkbox checked={form.agreedTerms} onChange={(e) => set({ agreedTerms: e.target.checked })}>
                I&apos;m 18+ and I agree to the <Link href="/terms" className={linkClass}>Terms &amp; Conditions</Link> and{' '}
                <Link href="/privacy" className={linkClass}>Privacy Policy</Link>
              </Checkbox>
            </div>
            {error && <FormError>{error}</FormError>}
            <Button type="submit" disabled={status === 'saving' || !form.agreedTerms} loading={status === 'saving'} block>
              {status === 'saving' ? 'Saving…' : 'Save and continue'}
            </Button>
          </form>
        )}
      </FormCard>
    </SplitLayout>
  );
}

// useSearchParams() forces this into client-side rendering, which Next
// requires to sit behind a Suspense boundary — without one, `next build`
// fails while prerendering this page. Same as /reset-password.
export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordInner />
    </Suspense>
  );
}
