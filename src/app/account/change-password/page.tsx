'use client';

import { useState } from 'react';
import { FormCard, SplitLayout } from '@/components/site/layout';
import { Button } from '@/components/site/button';
import { Field, FormError, FormSuccess, TextInput } from '@/components/site/form';

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
    <SplitLayout title="Change password" back={{ href: '/account', label: 'Back to my account' }}>
      <FormCard>
        {status === 'done' ? (
          <FormSuccess>Password updated.</FormSuccess>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Field label="Current password">
              <TextInput type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </Field>
            <Field label="New password">
              <TextInput type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            {error && <FormError>{error}</FormError>}
            <Button type="submit" disabled={status === 'saving'} loading={status === 'saving'} block className="mt-1">
              {status === 'saving' ? 'Saving…' : 'Save new password'}
            </Button>
          </form>
        )}
      </FormCard>
    </SplitLayout>
  );
}
