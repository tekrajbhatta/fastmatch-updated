'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Field, Input, Button, Card } from '@/components/ui';

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus('saving');
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'This link may have expired.');
      setStatus('idle');
      return;
    }
    setStatus('done');
    setTimeout(() => router.push('/login'), 1500);
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-extrabold text-ink">Set a new password</h1>
      <Card>
        {status === 'done' ? (
          <p className="text-sm font-bold text-green-dark">Password set — redirecting to login…</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <Field label="New password">
              <Input type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}
            <Button type="submit" disabled={status === 'saving'} className="w-full">
              {status === 'saving' ? 'Saving…' : 'Save new password'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
