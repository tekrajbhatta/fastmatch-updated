'use client';

import { useState } from 'react';
import { Button } from '@/components/site/button';
import { FormError, FormSuccess } from '@/components/site/form';

/**
 * "Send a new confirmation link" for a signed-in member whose email address
 * isn't confirmed. On My Account and the confirm-email page.
 */
export default function ResendConfirmation({ block = true }: { block?: boolean }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    setState('sending');
    const res = await fetch('/api/account/resend-confirmation', { method: 'POST' }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) {
      setState('idle');
      setError(typeof data?.error === 'string' ? data.error : "We couldn't send the email just now. Please try again.");
      return;
    }
    setSentTo(data.sentTo ?? '');
    setState('sent');
  }

  if (state === 'sent') return <FormSuccess>A new link is on its way to {sentTo || 'your email'}. It works for 7 days.</FormSuccess>;
  return (
    <>
      {error && <FormError>{error}</FormError>}
      <Button onClick={send} disabled={state === 'sending'} loading={state === 'sending'} block={block}>
        {state === 'sending' ? 'Sending…' : 'Send a new confirmation link'}
      </Button>
    </>
  );
}
