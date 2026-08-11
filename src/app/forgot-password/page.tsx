'use client';

import { useState } from 'react';
import { Field, Input, Button, Card } from '@/components/ui';

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
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Reset your password</h1>
      <p className="mb-6 text-sm text-ink/60">Enter the email you registered with and we'll send a reset link.</p>
      <Card>
        {sent ? (
          <p className="text-sm text-ink/70">If that email is registered, a reset link is on its way — check your inbox.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <Field label="Email">
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button type="submit" className="w-full">Send reset link</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
