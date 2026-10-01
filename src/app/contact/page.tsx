'use client';

import { useState } from 'react';
import { SplitLayout, FormCard } from '@/components/site/layout';
import { Field, TextInput, TextArea, FormError, FormSuccess } from '@/components/site/form';
import { Button, linkClass } from '@/components/site/button';

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
    <SplitLayout title="Contact us" lead="Questions or feedback? Send us a message and we'll get back to you.">
      <FormCard>
        {status === 'sent' ? (
          <FormSuccess>Thanks, your message has been sent.</FormSuccess>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Field label="Name">
              <TextInput required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <TextInput type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Message">
              <TextArea
                required
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={5}
              />
            </Field>
            {status === 'error' && (
              <FormError>
                Sorry, we couldn&apos;t send your message just now. Please try again, or email us
                directly at{' '}
                <a href="mailto:gil@fastmatch.com.au" className={linkClass}>gil@fastmatch.com.au</a>.
              </FormError>
            )}
            <Button type="submit" disabled={status === 'sending'} loading={status === 'sending'} block className="mt-1">
              {status === 'sending' ? 'Sending…' : status === 'error' ? 'Try again' : 'Send message'}
            </Button>
          </form>
        )}
      </FormCard>
    </SplitLayout>
  );
}
