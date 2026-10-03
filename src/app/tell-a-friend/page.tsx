'use client';

import { useState } from 'react';
import { FormCard, SplitLayout } from '@/components/site/layout';
import { Button } from '@/components/site/button';
import { Field, FormError, FormSuccess, RadioCards, TextInput } from '@/components/site/form';

const EMPTY = { email: '', name: '', mobile: '', gender: '', age: '' };

const GENDERS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
];

/** The old site's Tell A Friend page: register a friend, who's emailed an invitation. */
export default function TellAFriendPage() {
  const [form, setForm] = useState(EMPTY);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ name: string; email: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    const res = await fetch('/api/tell-a-friend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setSending(false);
    if (!res?.ok) { setError(typeof data.error === 'string' ? data.error : 'Sorry, something went wrong. Please try again.'); return; }
    setSent({ name: data.name, email: data.email });
    setForm(EMPTY);
  }

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <SplitLayout
      title="Tell A Friend"
      lead={
        <>
          If you&apos;d like some of your friends to know about Fast Match, then simply fill out their details below and
          we&apos;ll invite them to our site and then include them in our regular updates of events we are holding.
        </>
      }
    >
      <div className="flex w-full max-w-[480px] flex-col gap-4">
        {sent && (
          <FormSuccess>
            Thanks! If {sent.name} (<span className="[overflow-wrap:anywhere]">{sent.email}</span>) isn&apos;t with FastMatch yet, we&apos;ve emailed them an invitation to join. Want to invite someone else?
          </FormSuccess>
        )}

        <FormCard>
          <h2 className="font-display text-2xl font-extrabold leading-tight tracking-[-0.02em] text-ink-900">Friend&apos;s information</h2>
          {/* autoComplete off: otherwise the browser offers the MEMBER's own details. */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Field label="Email"><TextInput type="email" required autoComplete="off" value={form.email} onChange={(e) => set({ email: e.target.value })} /></Field>
            <Field label="First name"><TextInput required autoComplete="off" value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Mobile"><TextInput type="tel" required autoComplete="off" placeholder="04XX XXX XXX" value={form.mobile} onChange={(e) => set({ mobile: e.target.value })} /></Field>
            {/* Gender and Age share a row when the two option tiles still fit
                their labels, and stack on a phone. */}
            <div className="flex flex-wrap gap-x-3.5 gap-y-5">
              <div className="min-w-0 flex-[2_1_250px]">
                <RadioCards legend="Gender" name="gender" required value={form.gender} options={GENDERS} onChange={(gender) => set({ gender })} />
              </div>
              <Field label="Age" className="flex-[1_1_110px]">
                <TextInput type="number" required min={18} max={99} autoComplete="off" value={form.age} onChange={(e) => set({ age: e.target.value })} />
              </Field>
            </div>
            {error && <FormError>{error}</FormError>}
            <Button type="submit" disabled={sending} loading={sending} block className="mt-1">{sending ? 'Registering…' : 'Register friend'}</Button>
          </form>
        </FormCard>
      </div>
    </SplitLayout>
  );
}
