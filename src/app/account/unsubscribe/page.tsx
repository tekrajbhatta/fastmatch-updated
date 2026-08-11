'use client';

import { useState } from 'react';
import { Button, Card } from '@/components/ui';

export default function UnsubscribePage() {
  const [done, setDone] = useState(false);

  async function handleUnsubscribe() {
    await fetch('/api/account/unsubscribe', { method: 'POST' });
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
            <Button onClick={handleUnsubscribe} className="w-full">Unsubscribe</Button>
          </>
        )}
      </Card>
    </div>
  );
}
