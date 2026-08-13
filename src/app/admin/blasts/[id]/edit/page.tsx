'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Field, Input, Button, Card } from '@/components/ui';

export default function EditBlastPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/campaigns/${id}`).then((r) => r.json()).then((c) => {
      setForm({
        title: c.title, sendEmail: c.sendEmail, sendSms: c.sendSms,
        fromName: c.fromName, fromEmail: c.fromEmail, subject: c.subject ?? '',
        heading: c.heading ?? '', freeText: c.freeText ?? '', eventDetailsText: c.eventDetailsText ?? '',
        bookingLink: c.bookingLink ?? '', smsFromNumber: c.smsFromNumber ?? '', smsBody: c.smsBody ?? '',
      });
    });
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/admin/campaigns/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Only draft (never-sent) blasts can be edited.'); return; }
    router.push(`/admin/blasts/${id}`);
  }

  if (!form) return <p className="text-sm text-ink/50">Loading…</p>;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-extrabold text-ink">Edit blast</h1>
      <Card>
        <form onSubmit={handleSave}>
          <Field label="Title"><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          {form.sendEmail && (
            <>
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
            </>
          )}
          {form.sendSms && (
            <Field label="SMS message">
              <textarea className="w-full rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-plum" rows={3}
                value={form.smsBody} onChange={(e) => setForm({ ...form, smsBody: e.target.value })} />
            </Field>
          )}
          {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}
          <Button type="submit" disabled={saving} className="w-full">{saving ? 'Saving…' : 'Save changes'}</Button>
        </form>
      </Card>
    </div>
  );
}
