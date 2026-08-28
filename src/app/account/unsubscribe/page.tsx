'use client';

import { useState } from 'react';
import { Button, Card } from '@/components/ui';

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
    <div className="mx-auto max-w-sm text-center">
      <h1 className="mb-6 text-2xl font-extrabold text-ink">Unsubscribe from emails</h1>
      <Card>
        {done ? (
          <p className="text-sm text-ink/70">
            You're unsubscribed from marketing emails. You'll still get booking and event confirmations for events you've registered for.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-ink/70">
              You'll stop receiving newsletters and invitations. Booking and event confirmations aren't affected.
            </p>
            {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}
            <Button onClick={handleUnsubscribe} disabled={busy} className="w-full">
              {busy ? 'Unsubscribing…' : 'Unsubscribe'}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
