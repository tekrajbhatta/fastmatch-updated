'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FormCard, SplitLayout } from '@/components/site/layout';
import { Button, ButtonLink } from '@/components/site/button';
import { Field, FormError, FormSuccess, TextInput } from '@/components/site/form';
import { safeNext } from '@/lib/safeNext';
import { NETWORK_ERROR } from '@/lib/networkError';
import SessionExpired from '@/components/site/SessionExpired';

function ChangePasswordInner() {
  // Opened from "Finish setting up your account", it goes back there after.
  const nextParam = useSearchParams().get('next');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus('saving');
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    }).catch(() => null);
    if (!res) { setError(NETWORK_ERROR); setStatus('idle'); return; }
    if (res.status === 401) { setNeedsLogin(true); setStatus('idle'); return; }
    const data = await res.json().catch(() => ({}));
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
        {needsLogin ? (
          <SessionExpired next="/account/change-password" />
        ) : status === 'done' ? (
          <>
            <FormSuccess>Password updated.</FormSuccess>
            {nextParam && <ButtonLink href={safeNext(nextParam, '/account', window.location.origin)} block>Continue</ButtonLink>}
          </>
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

// useSearchParams() needs a Suspense boundary, or `next build` fails prerendering.
export default function ChangePasswordPage() {
  return (
    <Suspense fallback={null}>
      <ChangePasswordInner />
    </Suspense>
  );
}
