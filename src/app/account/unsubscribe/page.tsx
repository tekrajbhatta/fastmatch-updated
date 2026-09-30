'use client';

import { useState } from 'react';
import { FormCard, SplitLayout } from '@/components/site/layout';
import { Button } from '@/components/site/button';
import { FormError, FormSuccess } from '@/components/site/form';

export default function UnsubscribePage() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleUnsubscribe() {
    setError(null);
    setBusy(true);
    const res = await fetch('/api/account/unsubscribe', { method: 'POST' });
    setBusy(false);
    // The response used to be discarded and success shown unconditionally —
    // so a failed request still told the member they were unsubscribed while
    // marketingOptIn was untouched, and they kept receiving the emails they
    // had just opted out of. Never claim an opt-out that didn't happen.
    if (!res.ok) {
      setError('We could not unsubscribe you just now. Please try again, or email gil@fastmatch.com.au.');
      return;
    }
    setDone(true);
  }

  return (
    <SplitLayout title="Unsubscribe from emails">
      <FormCard>
        {done ? (
          <FormSuccess>
            You're unsubscribed from marketing emails. You'll still get booking and event confirmations for events you've registered for.
          </FormSuccess>
        ) : (
          <>
            <p className="text-base leading-relaxed text-ink-600">
              You'll stop receiving newsletters and invitations. Booking and event confirmations aren't affected.
            </p>
            {error && <FormError>{error}</FormError>}
            <Button onClick={handleUnsubscribe} disabled={busy} block>
              {busy ? 'Unsubscribing…' : 'Unsubscribe'}
            </Button>
          </>
        )}
      </FormCard>
    </SplitLayout>
  );
}
