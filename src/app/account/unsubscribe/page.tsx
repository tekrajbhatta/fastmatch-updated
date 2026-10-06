'use client';

import { useEffect, useState } from 'react';
import { FormCard, SplitLayout, LoadingNote } from '@/components/site/layout';
import { Button } from '@/components/site/button';
import { FormError, FormSuccess } from '@/components/site/form';
import UnsubscribeChoice from '@/components/site/UnsubscribeChoice';

/**
 * "Event news and offers" on My account: unsubscribe (Gil's question first,
 * as from an email or text), or, for a member who isn't subscribed, opt back
 * in, which the unsubscribe page has always promised (Gil, Q15: members can
 * agree to opt-ins themselves).
 */
export default function EventNewsPage() {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => (d?.member ? setSubscribed(!!d.member.marketingOptIn) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);

  async function subscribe() {
    setError(null);
    setBusy(true);
    const res = await fetch('/api/account/subscribe', { method: 'POST' }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setError('That didn’t work. Please try again.'); return; }
    setJoined(true);
  }

  return (
    <SplitLayout title="Event news and offers" back={{ href: '/account', label: 'Back to my account' }}>
      <FormCard>
        {failed ? (
          <FormError>Your session has expired. Please log in again.</FormError>
        ) : subscribed === null ? (
          <LoadingNote>One moment…</LoadingNote>
        ) : subscribed ? (
          <UnsubscribeChoice mode={{ kind: 'account' }} />
        ) : joined ? (
          <FormSuccess>You&apos;re subscribed. You&apos;ll hear about our upcoming events and offers by email and text.</FormSuccess>
        ) : (
          <>
            <p className="text-base leading-relaxed text-ink-600">
              You&apos;re not getting our event news and offers at the moment. Would you like to hear about our upcoming events
              by email and text? You can unsubscribe any time.
            </p>
            {error && <FormError>{error}</FormError>}
            <Button onClick={subscribe} disabled={busy} loading={busy} block>{busy ? 'Subscribing…' : 'Subscribe'}</Button>
          </>
        )}
      </FormCard>
    </SplitLayout>
  );
}
