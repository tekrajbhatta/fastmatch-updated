'use client';

import { useState } from 'react';
import { SplitLayout, FormCard } from '@/components/site/layout';
import { Field, TextInput, FormSuccess } from '@/components/site/form';
import { Button } from '@/components/site/button';

const SENDER_NOTE = 'The email comes from FastMatch (no-reply@mg.fastmatch.com.au). We never ask for your password by email.';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  // The button used to give no sign it had been pressed while the email went.
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).finally(() => setSending(false));
    setSent(true);
  }

  return (
    <SplitLayout title="Reset your password" back={{ href: '/login', label: 'Back to log in' }} lead="Enter the email you registered with and we'll send a reset link.">
      <FormCard>
        {sent ? (
          <FormSuccess>If that email is registered, a reset link is on its way. Check your inbox.</FormSuccess>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Field label="Email">
              <TextInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button type="submit" disabled={sending} loading={sending} block className="mt-1">Send reset link</Button>
          </form>
        )}
        {/* So a look-alike email asking for a password is easier to spot. The
            address must match EMAIL_FROM_ADDRESS on the server. */}
        <p className="text-[15px] leading-normal text-ink-600">{SENDER_NOTE}</p>
      </FormCard>
    </SplitLayout>
  );
}
