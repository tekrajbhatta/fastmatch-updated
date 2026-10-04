'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SplitLayout, FormCard, LoadingNote } from '@/components/site/layout';
import { FormError, FormSuccess } from '@/components/site/form';
import { ButtonLink, linkClass } from '@/components/site/button';

// Landing page for the link in the welcome/verification email
// (`${APP_URL}/verify-email?token=...`). The API route existed but this page
// didn't, so the emailed link 404'd and members could never verify.

function VerifyEmailInner() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'verifying' | 'done' | 'error'>('verifying');
  const [error, setError] = useState('This link is invalid or has expired.');
  // Set when the link was for a new address from My Account.
  const [changedTo, setChangedTo] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState('error');
      setError('This link is missing its verification code. Use the full link from your email.');
      return;
    }
    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (r.ok) {
          if (data?.changedTo) setChangedTo(data.changedTo);
          return setState('done');
        }
        if (data?.error) setError(data.error);
        setState('error');
      })
      .catch(() => setState('error'));
  }, [token]);

  return (
    <SplitLayout title="Email verification">
      <FormCard>
        {state === 'verifying' && <LoadingNote>Verifying your email…</LoadingNote>}
        {state === 'done' && changedTo && (
          <>
            <FormSuccess>Your email address is now {changedTo}.</FormSuccess>
            <p className="text-[15px] leading-normal text-ink-600">
              It&apos;s confirmed, and it&apos;s the address to log in with from now on.
            </p>
            <ButtonLink href="/account" block>My account</ButtonLink>
          </>
        )}
        {state === 'done' && !changedTo && (
          <>
            <FormSuccess>Your email is verified.</FormSuccess>
            <p className="text-[15px] leading-normal text-ink-600">
              If you haven't already, enter the 6-digit code we texted you. Both steps are
              needed before you can book an event.
            </p>
            <ButtonLink href="/verify-mobile" block>Enter SMS code</ButtonLink>
            <Link href="/events" className={`${linkClass} self-center text-[15px]`}>Browse events</Link>
          </>
        )}
        {state === 'error' && (
          <>
            <FormError>{error}</FormError>
            <Link href="/login" className={`${linkClass} self-center text-[15px]`}>Log in</Link>
          </>
        )}
      </FormCard>
    </SplitLayout>
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
