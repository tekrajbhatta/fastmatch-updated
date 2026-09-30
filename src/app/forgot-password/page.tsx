'use client';

import { useState } from 'react';
import { SplitLayout, FormCard } from '@/components/site/layout';
import { Field, TextInput, FormSuccess } from '@/components/site/form';
import { Button } from '@/components/site/button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setSent(true);
  }

  return (
    <SplitLayout title="Reset your password" lead="Enter the email you registered with and we'll send a reset link.">
      <FormCard>
        {sent ? (
          <FormSuccess>If that email is registered, a reset link is on its way — check your inbox.</FormSuccess>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Field label="Email">
              <TextInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button type="submit" block className="mt-1">Send reset link</Button>
          </form>
        )}
      </FormCard>
    </SplitLayout>
  );
}
