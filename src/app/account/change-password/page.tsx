'use client';

import { useState } from 'react';
import { Field, Input, Button, Card } from '@/components/ui';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus('saving');
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Something went wrong.');
      setStatus('idle');
      return;
    }
    setStatus('done');
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-extrabold text-ink">Change password</h1>
      <Card>
        {status === 'done' ? (
          <p className="text-sm font-bold text-green-dark">Password updated.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <Field label="Current password">
              <Input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </Field>
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
