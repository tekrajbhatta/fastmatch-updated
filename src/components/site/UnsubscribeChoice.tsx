'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, linkClass } from '@/components/site/button';
import { Field, TextInput, FormError, FormSuccess } from '@/components/site/form';
import { AU_MOBILE_MESSAGE } from '@/lib/mobile';

/**
 * Who's unsubscribing:
 *   token   — the Unsubscribe link in a blast email (it says who);
 *   account — a member who's signed in (My account, or the text's link);
 *   mobile  — the link in a blast text, not signed in: they enter the number
 *             the texts come to.
 */
export type UnsubscribeMode = { kind: 'token'; token: string } | { kind: 'account' } | { kind: 'mobile' };

/**
 * Gil's opt-out step (Q16): before unsubscribing, the member is told what
 * they'd miss and chooses. His wording, except that unsubscribing only stops
 * event news and offers: they stay a member and still get emails about their
 * own bookings (the user, 6 Oct), where Gil had "unsubscribe totally from the
 * service".
 */
export default function UnsubscribeChoice({ mode }: { mode: UnsubscribeMode }) {
  const [state, setState] = useState<'ask' | 'unsubscribed' | 'kept'>('ask');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobile, setMobile] = useState('');

  async function unsubscribe(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    const post = (url: string, body?: unknown) =>
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const res = await (mode.kind === 'token'
      ? post('/api/unsubscribe', { token: mode.token })
      : mode.kind === 'account'
        ? post('/api/account/unsubscribe')
        : post('/api/unsubscribe/mobile', { mobile })
    ).catch(() => null);
    setBusy(false);
    // Never claim an opt-out that didn't happen.
    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      setError(typeof data?.error === 'string' ? data.error : 'We could not unsubscribe you just now. Please try again, or email gil@fastmatch.com.au.');
      return;
    }
    setState('unsubscribed');
  }

  if (state === 'unsubscribed') {
    return (
      <>
        <FormSuccess>You&apos;re unsubscribed.</FormSuccess>
        <p className="text-[15px] leading-normal text-ink-600">
          {mode.kind === 'mobile' ? 'That number won’t get our event news and offers any more, by text or email.' : 'You won’t get our event news and offers any more, by email or text.'}{' '}
          You&apos;ll still get emails about your own bookings. Changed your mind? You can subscribe again from{' '}
          <Link href="/account" className={linkClass}>My account</Link>.
        </p>
      </>
    );
  }
  if (state === 'kept') {
    return <FormSuccess>Thanks! Nothing has changed: you&apos;ll keep hearing about our upcoming events.</FormSuccess>;
  }

  return (
    <form onSubmit={unsubscribe} className="flex flex-col gap-5">
      <p className="text-base leading-relaxed text-ink-600">
        We appreciate you would like to opt out of receiving communication from FastMatch, however that means you won&apos;t know
        about our upcoming events. Would you like to leave everything like it is or unsubscribe from our event news and offers?
      </p>
      {mode.kind === 'mobile' && (
        <Field label="Your mobile number">
          <TextInput type="tel" required autoComplete="tel" placeholder="0412 345 678" title={AU_MOBILE_MESSAGE} value={mobile} onChange={(e) => setMobile(e.target.value)} />
        </Field>
      )}
      {error && <FormError>{error}</FormError>}
      <div className="flex flex-col gap-3">
        <Button type="button" variant="secondary" onClick={() => setState('kept')} disabled={busy} block>Leave everything like it is</Button>
        <Button type="submit" disabled={busy} loading={busy} block>{busy ? 'Unsubscribing…' : 'Unsubscribe'}</Button>
      </div>
      <p className="text-[14px] leading-normal text-ink-600">Either way, you&apos;ll still get emails about your own bookings.</p>
    </form>
  );
}
