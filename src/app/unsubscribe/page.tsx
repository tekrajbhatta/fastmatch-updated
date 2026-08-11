'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui';

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
      setError('This link is missing its code — use the full link from the email.');
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
    <div className="mx-auto max-w-sm text-center">
      <h1 className="mb-6 text-2xl font-extrabold text-ink">Unsubscribe</h1>
      <Card>
        {state === 'working' && <p className="text-sm text-ink/60">One moment…</p>}
        {state === 'done' && (
          <>
            <p className="mb-1 font-bold text-green-dark">You're unsubscribed.</p>
            <p className="text-sm text-ink/60">
              No more marketing emails. You'll still get booking confirmations and match
              results for events you attend. Changed your mind? You can opt back in from{' '}
              <Link href="/account" className="font-bold text-plum">your account</Link>.
            </p>
          </>
        )}
        {state === 'error' && <p className="text-sm font-medium text-coral">{error}</p>}
      </Card>
    </div>
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
