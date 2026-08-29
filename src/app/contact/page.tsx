'use client';

import { useState } from 'react';
import { Field, Input, Button, Card } from '@/components/ui';

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    const res = await fetch('/api/contact-us', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }).catch(() => null);

    // The response used to be discarded and "sent" shown unconditionally. A
    // rejected send — or no network at all — still told the visitor their
    // message was on its way while it had actually gone nowhere, and nobody
    // found out: not them, not Gil. Only claim it sent if it did.
    //
    // On failure the form is deliberately left filled in, so whatever they
    // typed is still there to retry or copy into an email.
    if (!res || !res.ok) {
      setStatus('error');
      return;
    }
    setStatus('sent');
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Contact us</h1>
      <p className="mb-6 text-sm text-ink/60">Questions or feedback? Send us a message and we'll get back to you.</p>
      <Card>
        {status === 'sent' ? (
          <p className="text-sm font-bold text-green-dark">Thanks — your message has been sent.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <Field label="Name">
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Message">
              <textarea
                required
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className="w-full rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-plum"
                rows={4}
              />
            </Field>
            {status === 'error' && (
              <p className="mb-4 text-sm font-medium text-coral">
                Sorry — we couldn&apos;t send your message just now. Please try again, or email us
                directly at{' '}
                <a href="mailto:gil@fastmatch.com.au" className="font-bold underline">gil@fastmatch.com.au</a>.
              </p>
            )}
            <Button type="submit" disabled={status === 'sending'} className="w-full">
              {status === 'sending' ? 'Sending…' : status === 'error' ? 'Try again' : 'Send message'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
