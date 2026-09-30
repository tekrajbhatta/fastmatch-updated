'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { SplitLayout, FormCard } from '@/components/site/layout';
import { Field, TextInput, FormError, FormSuccess } from '@/components/site/form';
import { Button } from '@/components/site/button';

function ResetPasswordInner() {
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
    <SplitLayout title="Set a new password">
      <FormCard>
        {status === 'done' ? (
          <FormSuccess>Password set — redirecting to login…</FormSuccess>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Field label="New password">
              <TextInput type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            {error && <FormError>{error}</FormError>}
            <Button type="submit" disabled={status === 'saving'} block className="mt-1">
              {status === 'saving' ? 'Saving…' : 'Save new password'}
            </Button>
          </form>
        )}
      </FormCard>
    </SplitLayout>
  );
}

// useSearchParams() forces this into client-side rendering, which Next
// requires to sit behind a Suspense boundary — without one, `next build`
// fails while prerendering this page.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
