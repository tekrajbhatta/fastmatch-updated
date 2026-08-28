'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Field, Input, Select, Button, Card } from '@/components/ui';

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
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

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

  // Uploaded as soon as it's chosen, rather than held until save: the server
  // re-encodes and resizes it, so the URL it returns is what actually goes in
  // the email — and the admin sees the real thing before committing to it.
  async function handlePhoto(file: File) {
    setPhotoError(null);
    setUploading(true);
    const body = new FormData();
    body.append('file', file);
    const res = await fetch('/api/admin/uploads', { method: 'POST', body });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) {
      setPhotoError(typeof data.error === 'string' ? data.error : 'That image could not be uploaded.');
      return;
    }
    setForm((f) => ({ ...f, photoUrl: data.url }));
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
              <Field label="Photo">
                {form.photoUrl ? (
                  <div className="flex items-start gap-3">
                    {/* Plain <img>, not next/image: this is a runtime-uploaded
                        file served from outside public/, so there is nothing
                        for the image optimiser to know about at build time. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.photoUrl} alt="" className="h-24 w-24 rounded-lg object-cover" />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, photoUrl: '' })}
                      className="text-sm font-bold text-coral hover:underline"
                    >
                      Remove photo
                    </button>
                  </div>
                ) : (
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploading}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhoto(f); }}
                    className="w-full text-sm text-ink/70 file:mr-3 file:rounded-lg file:border-0 file:bg-plum/10 file:px-3 file:py-2 file:text-sm file:font-bold file:text-plum"
                  />
                )}
                {uploading && <p className="mt-1 text-xs text-ink/50">Uploading and optimising…</p>}
                {photoError && <p className="mt-1 text-xs font-medium text-coral">{photoError}</p>}
                {!form.photoUrl && !uploading && !photoError && (
                  <p className="mt-1 text-xs text-ink/50">Optional. Resized automatically to fit the email.</p>
                )}
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
