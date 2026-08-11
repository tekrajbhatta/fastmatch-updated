'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, Button } from '@/components/ui';

// Landing page for the link in the welcome/verification email
// (`${APP_URL}/verify-email?token=...`). The API route existed but this page
// didn't, so the emailed link 404'd and members could never verify.

function VerifyEmailInner() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'verifying' | 'done' | 'error'>('verifying');
  const [error, setError] = useState('This link is invalid or has expired.');

  useEffect(() => {
    if (!token) {
      setState('error');
      setError('This link is missing its verification code — use the full link from your email.');
      return;
    }
    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (r.ok) return setState('done');
        const data = await r.json().catch(() => null);
        if (data?.error) setError(data.error);
        setState('error');
      })
      .catch(() => setState('error'));
  }, [token]);

  return (
    <div className="mx-auto max-w-sm text-center">
      <h1 className="mb-6 text-2xl font-extrabold text-ink">Email verification</h1>
      <Card>
        {state === 'verifying' && <p className="text-sm text-ink/60">Verifying your email…</p>}
        {state === 'done' && (
          <>
            <p className="mb-1 font-bold text-green-dark">Your email is verified.</p>
            <p className="mb-5 text-sm text-ink/60">
              If you haven't already, enter the 6-digit code we texted you — both steps are
              needed before you can book an event.
            </p>
            <Link href="/verify-mobile"><Button className="w-full">Enter SMS code</Button></Link>
            <Link href="/events" className="mt-3 block text-sm font-bold text-plum">Browse events</Link>
          </>
        )}
        {state === 'error' && (
          <>
            <p className="mb-5 text-sm font-medium text-coral">{error}</p>
            <Link href="/login" className="text-sm font-bold text-plum">Log in</Link>
          </>
        )}
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  // useSearchParams requires a Suspense boundary during prerender
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
