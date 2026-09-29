'use client';

import { useState } from 'react';
import { Button, Card, Field, Input } from '@/components/ui';

const EMPTY = { email: '', name: '', mobile: '', gender: '', age: '' };

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
    if (!res?.ok) { setError(typeof data.error === 'string' ? data.error : 'Sorry — something went wrong. Please try again.'); return; }
    setSent({ name: data.name, email: data.email });
    setForm(EMPTY);
  }

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-2 text-2xl font-extrabold text-ink">Tell A Friend</h1>
      <p className="mb-6 text-sm text-ink/60">
        If you&apos;d like some of your friends to know about Fast Match, then simply fill out their details below and
        we&apos;ll invite them to our site and then include them in our regular updates of events we are holding.
      </p>

      {sent && (
        <p role="status" className="mb-4 rounded-lg bg-green/15 p-3 text-sm font-bold text-green-dark">
          Thanks! We&apos;ve emailed {sent.name} ({sent.email}) an invitation to join FastMatch. Want to invite someone else?
        </p>
      )}

      <Card>
        <h2 className="mb-4 font-extrabold text-ink">Friend&apos;s information</h2>
        {/* autoComplete off: otherwise the browser offers the MEMBER's own details. */}
        <form onSubmit={handleSubmit}>
          <Field label="Email"><Input type="email" required autoComplete="off" value={form.email} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label="First name"><Input required autoComplete="off" value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Mobile"><Input type="tel" required autoComplete="off" placeholder="04XX XXX XXX" value={form.mobile} onChange={(e) => set({ mobile: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gender">
              <div className="flex h-[42px] items-center gap-4 text-sm text-ink">
                <label className="flex items-center gap-1.5"><input type="radio" name="gender" required checked={form.gender === 'MALE'} onChange={() => set({ gender: 'MALE' })} /> Male</label>
                <label className="flex items-center gap-1.5"><input type="radio" name="gender" checked={form.gender === 'FEMALE'} onChange={() => set({ gender: 'FEMALE' })} /> Female</label>
              </div>
            </Field>
            <Field label="Age"><Input type="number" required min={18} max={99} autoComplete="off" value={form.age} onChange={(e) => set({ age: e.target.value })} /></Field>
          </div>
          {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}
          <Button type="submit" disabled={sending} className="w-full">{sending ? 'Registering…' : 'Register friend'}</Button>
        </form>
      </Card>
    </div>
  );
}
