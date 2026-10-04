'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { SplitLayout, FormCard, LoadingNote } from '@/components/site/layout';
import { FormError, FormSuccess } from '@/components/site/form';
import { ButtonLink, linkClass } from '@/components/site/button';

// Landing page for the link in the "confirm your email to finish joining"
// email (`${APP_URL}/complete-signup?token=...`). Opening it creates the
// account and signs the member in; see /api/auth/complete-signup.

function CompleteSignupInner() {
  const token = useSearchParams().get('token');
  const router = useRouter();
  const [state, setState] = useState<'working' | 'done' | 'error'>('working');
  const [smsSent, setSmsSent] = useState(true);
  const [error, setError] = useState('This link has expired or has already been used. Please sign up again.');
  const [alreadyMember, setAlreadyMember] = useState(false);
  // The link works once; never send it twice (React can run an effect twice in development).
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    if (!token) {
      setState('error');
      setError('This link is missing part of its code. Please use the full link from your email.');
      return;
    }
    fetch('/api/auth/complete-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (r.ok) {
          setSmsSent(data?.smsSent !== false);
          setState('done');
          router.refresh(); // signed in now: the header should say so
          return;
        }
        if (data?.error) setError(data.error);
        setAlreadyMember(r.status === 409);
        setState('error');
      })
      .catch(() => setState('error'));
  }, [token, router]);

  return (
    <SplitLayout title="Welcome to FastMatch">
      <FormCard>
        {state === 'working' && <LoadingNote>Setting up your account…</LoadingNote>}
        {state === 'done' && (
          <>
            <FormSuccess>Your email is confirmed and your account is ready.</FormSuccess>
            <p className="text-[15px] leading-normal text-ink-600">
              {smsSent
                ? 'Last step: enter the 6-digit code we’ve just texted to your mobile. Then you can book events.'
                : 'Last step: confirm your mobile. We couldn’t text your code just now, so check your number and tap “Resend code” on the next page.'}
            </p>
            <ButtonLink href={smsSent ? '/verify-mobile' : '/verify-mobile?smsFailed=1'} block>Enter SMS code</ButtonLink>
          </>
        )}
        {state === 'error' && (
          <>
            <FormError>{error}</FormError>
            {alreadyMember ? (
              <ButtonLink href="/login" block>Log in</ButtonLink>
            ) : (
              <>
                <ButtonLink href="/register" block>Sign up</ButtonLink>
                <Link href="/login" className={`${linkClass} self-center text-[15px]`}>Already a member? Log in</Link>
              </>
            )}
          </>
        )}
      </FormCard>
    </SplitLayout>
  );
}

export default function CompleteSignupPage() {
  // useSearchParams requires a Suspense boundary during prerender
  return (
    <Suspense fallback={null}>
      <CompleteSignupInner />
    </Suspense>
  );
}
