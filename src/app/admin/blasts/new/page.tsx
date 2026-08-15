'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Field, Input, Select, Button, Card } from '@/components/ui';

function NewBlastInner() {
  const params = useSearchParams();
  const router = useRouter();

  const [form, setForm] = useState({
    title: '', sendEmail: true, sendSms: false,
    fromName: 'FastMatch', fromEmail: 'donotreply@fastmatch.com.au',
    subject: params.get('subject') ?? '',
    heading: params.get('heading') ?? '',
    freeText: '', eventDetailsText: params.get('eventDetails') ?? '',
    bookingLink: params.get('bookingLink') ?? '',
    smsFromNumber: '', smsBody: '',
    ignorePreference: false, automated: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill the title from subject the first time params arrive
  useEffect(() => {
    if (params.get('subject') && !form.title) {
      setForm((f) => ({ ...f, title: params.get('subject') ?? '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch('/api/admin/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, filter: {} }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Please check the required fields.');
      return;
    }
    // Saving lands directly on Select Members (the Send tab) — not Details,
    // which the admin would have to know to click into. See project notes.
    router.push(`/admin/blasts/${data.id}?tab=send`);
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Create blast</h1>
      <p className="mb-6 text-sm text-ink/60">Reusable — you can send it more than once, to different filtered lists, until you stop re-using it.</p>

      <Card>
        <form onSubmit={handleSave}>
          <Field label="Title"><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>

          <label className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
            <input type="checkbox" checked={form.sendEmail} onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })} /> Send Email?
          </label>
          {form.sendEmail && (
            <div className="mb-4 rounded-lg bg-cream/40 p-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="From name"><Input value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} /></Field>
                <Field label="From address"><Input value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} /></Field>
              </div>
              <Field label="Subject"><Input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
              <Field label="Heading"><Input value={form.heading} onChange={(e) => setForm({ ...form, heading: e.target.value })} /></Field>
              <Field label="Free text">
                <textarea className="w-full rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-plum" rows={4}
                  value={form.freeText} onChange={(e) => setForm({ ...form, freeText: e.target.value })} />
              </Field>
              <Field label="Event details">
                <textarea className="w-full rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-plum" rows={3}
                  value={form.eventDetailsText} onChange={(e) => setForm({ ...form, eventDetailsText: e.target.value })} />
              </Field>
              <Field label="Booking link"><Input value={form.bookingLink} onChange={(e) => setForm({ ...form, bookingLink: e.target.value })} /></Field>
            </div>
          )}

          <label className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
            <input type="checkbox" checked={form.sendSms} onChange={(e) => setForm({ ...form, sendSms: e.target.checked })} /> Send SMS?
          </label>
          {form.sendSms && (
            <div className="mb-4 rounded-lg bg-cream/40 p-4">
              <Field label="SMS from number"><Input value={form.smsFromNumber} onChange={(e) => setForm({ ...form, smsFromNumber: e.target.value })} /></Field>
              <Field label="SMS message">
                <textarea className="w-full rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-plum" rows={3}
                  value={form.smsBody} onChange={(e) => setForm({ ...form, smsBody: e.target.value })} />
              </Field>
            </div>
          )}

          <label className="mb-4 flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" checked={form.ignorePreference} onChange={(e) => setForm({ ...form, ignorePreference: e.target.checked })} />
            Ignore preference — overrides each member's contact setting
          </label>

          {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}

          <Button type="submit" disabled={saving} className="w-full">{saving ? 'Saving…' : 'Save blast & select members'}</Button>
        </form>
      </Card>
    </div>
  );
}

// useSearchParams() (used here to pre-fill from an event's details) forces
// client-side rendering, which Next requires to sit behind a Suspense
// boundary — without one, `next build` fails prerendering this page.
export default function NewBlastPage() {
  return (
    <Suspense fallback={null}>
      <NewBlastInner />
    </Suspense>
  );
}
