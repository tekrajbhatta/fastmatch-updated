'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Field, Input, Select, Button, Card } from '@/components/ui';
import PhotoUploadField from '@/components/PhotoUploadField';

interface Template {
  id: string; title: string; subject: string | null; heading: string | null;
  freeText: string | null; eventDetailsText: string | null; bookingLink: string | null;
  photoUrl: string | null; smsBody: string | null;
}

function NewBlastInner() {
  const params = useSearchParams();
  const router = useRouter();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');

  const [form, setForm] = useState({
    title: '', sendEmail: true, sendSms: false,
    fromName: 'FastMatch', fromEmail: 'donotreply@fastmatch.com.au',
    subject: params.get('subject') ?? '',
    heading: params.get('heading') ?? '',
    freeText: '', eventDetailsText: params.get('eventDetails') ?? '',
    bookingLink: params.get('bookingLink') ?? '',
    photoUrl: '',
    smsFromNumber: '', smsBody: '',
    ignorePreference: false, automated: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/campaign-templates').then((r) => r.json()).then(setTemplates);
  }, []);

  // Pre-fill the title from subject the first time query params arrive
  // (e.g. arriving here via "Create blast for this event")
  useEffect(() => {
    if (params.get('subject') && !form.title) {
      setForm((f) => ({ ...f, title: params.get('subject') ?? '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selecting a template copies its content into THIS blast's own editable
  // fields — not a live reference. Only fills fields that are still empty,
  // so it won't clobber anything already typed (e.g. from the "Create blast
  // for this event" query params above).
  function applyTemplate(id: string) {
    setTemplateId(id);
    if (!id) return;
    const t = templates.find((tpl) => tpl.id === id);
    if (!t) return;
    setForm((f) => ({
      ...f,
      subject: f.subject || t.subject || '',
      heading: f.heading || t.heading || '',
      freeText: f.freeText || t.freeText || '',
      eventDetailsText: f.eventDetailsText || t.eventDetailsText || '',
      bookingLink: f.bookingLink || t.bookingLink || '',
      photoUrl: f.photoUrl || t.photoUrl || '',
      smsBody: f.smsBody || t.smsBody || '',
    }));
  }


  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch('/api/admin/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, templateId: templateId || undefined, filter: {} }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Please check the required fields.');
      return;
    }
    // Saving lands on the Preview tab, not straight into member selection —
    // matches the requested flow: create -> save -> preview -> edit as
    // needed -> filter members -> preview final time -> send.
    router.push(`/admin/blasts/${data.id}`);
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Create blast</h1>
      <p className="mb-6 text-sm text-ink/60">Reusable — you can send it more than once, to different filtered lists, until you stop re-using it.</p>

      <Card>
        <form onSubmit={handleSave}>
          <Field label="Title"><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>

          <Field label="Blast template">
            <Select value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">(None — start blank)</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </Select>
          </Field>
          {templateId && (
            <p className="mb-4 -mt-2 text-xs text-ink/50">
              Content copied in below — edit freely, this blast has its own independent copy and won&apos;t affect the template or any other blast.
            </p>
          )}

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
              <PhotoUploadField value={form.photoUrl} onChange={(url) => setForm((f) => ({ ...f, photoUrl: url }))} />

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

          <Button type="submit" disabled={saving} className="w-full">{saving ? 'Saving…' : 'Save blast & preview'}</Button>
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
