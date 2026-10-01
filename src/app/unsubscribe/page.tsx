'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SplitLayout, FormCard, LoadingNote } from '@/components/site/layout';
import { FormError, FormSuccess } from '@/components/site/form';
import { linkClass } from '@/components/site/button';

// Landing page for the one-click unsubscribe link in campaign emails
// (`${APP_URL}/unsubscribe?token=...`). The API existed but this page didn't,
// so the emailed link 404'd — a compliance problem for any real campaign.
// Token-based (no login needed); only turns off marketing. Booking and event
// emails still send, same as the in-app version explains.

function UnsubscribeInner() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'working' | 'done' | 'error'>('working');
  const [error, setError] = useState('This unsubscribe link is invalid or has expired.');

  useEffect(() => {
    if (!token) {
      setState('error');
      setError('This link is missing its code. Use the full link from the email.');
      return;
    }
    fetch(`/api/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (r.ok) return setState('done');
        const data = await r.json().catch(() => null);
        if (data?.error) setError(data.error);
        setState('error');
      })
      .catch(() => setState('error'));
  }, [token]);

  return (
    <SplitLayout title="Unsubscribe">
      <FormCard>
        {state === 'working' && <LoadingNote>One moment…</LoadingNote>}
        {state === 'done' && (
          <>
            <FormSuccess>You're unsubscribed.</FormSuccess>
            <p className="text-[15px] leading-normal text-ink-600">
              No more marketing emails. You'll still get booking confirmations and match
              results for events you attend. Changed your mind? You can opt back in from{' '}
              <Link href="/account" className={linkClass}>your account</Link>.
            </p>
          </>
        )}
        {state === 'error' && <FormError>{error}</FormError>}
      </FormCard>
    </SplitLayout>
  );
}

export default function UnsubscribePage() {
  // useSearchParams requires a Suspense boundary during prerender
  return (
    <Suspense fallback={null}>
      <UnsubscribeInner />
    </Suspense>
  );
}
