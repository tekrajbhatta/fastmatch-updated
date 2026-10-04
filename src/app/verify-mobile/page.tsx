'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SplitLayout, FormCard, LoadingNote } from '@/components/site/layout';
import { Field, TextInput, FormError, FormSuccess } from '@/components/site/form';
import { Button, ButtonLink, linkClass } from '@/components/site/button';
import { Spinner } from '@/components/Spinner';
import { safeNext } from '@/lib/safeNext';

// SMS verification — enter the 6-digit code sent at registration. The API
// routes (verify-mobile, resend-mobile-code) existed but no screen ever
// collected the code, so mobileVerified could never become true and the
// booking gate blocked every self-registered member.
//
// Session-based: the member is already logged in from registration, so no
// token in the URL — register redirects straight here.

function VerifyMobileInner() {
  const router = useRouter();
  const params = useSearchParams();
  // register redirects here with ?smsFailed=1 when the verification text
  // couldn't be sent, so the page doesn't claim a code is on its way when it
  // isn't. Cleared as soon as Resend succeeds.
  const [smsFailed, setSmsFailed] = useState(params.get('smsFailed') === '1');
  // Where they were going (an event they were booking, say): "Continue" goes
  // back there once the mobile is confirmed. Only a page on this site.
  const nextParam = params.get('next');
  const [me, setMe] = useState<{ mobileVerified: boolean; emailVerified: boolean; mobile: string; mobileVerificationExpires: string | null } | null>(null);
  // A code texted from this page.
  const [codeSent, setCodeSent] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((data) => {
      setMe(data.member);
      setLoaded(true);
    });
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch('/api/auth/verify-mobile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? 'Verification failed. Try again.');
      return;
    }
    setMe((m) => (m ? { ...m, mobileVerified: true } : m));
  }

  async function handleResend() {
    setError(null);
    setNotice(null);
    // One code per press: the link is disabled (with a spinner) until the
    // text has gone, so an impatient second tap doesn't send another.
    setResending(true);
    const res = await fetch('/api/auth/resend-mobile-code', { method: 'POST' }).finally(() => setResending(false));
    const data = await res.json();
    if (!res.ok) setError(data.error ?? 'Could not resend the code.');
    else {
      setSmsFailed(false);
      setCodeSent(true);
      setNotice('A new code is on its way to your mobile.');
    }
  }

  const goOn = () => router.push(safeNext(nextParam, '/events', window.location.origin));

  if (!loaded) {
    return (
      <SplitLayout title="Verify your mobile">
        <FormCard><LoadingNote>Loading…</LoadingNote></FormCard>
      </SplitLayout>
    );
  }

  if (!me) {
    return (
      <SplitLayout title="Verify your mobile">
        <FormCard>
          <p className="text-[15px] leading-normal text-ink-600">Log in first, then verify your mobile from here.</p>
          <ButtonLink href="/login" block>Log in</ButtonLink>
        </FormCard>
      </SplitLayout>
    );
  }

  // Arriving from a link (the event page, My Account) rather than straight
  // after signing up, there may be no code waiting: offer to text one rather
  // than claim one was sent.
  const codeWaiting = codeSent || (!!me.mobileVerificationExpires && new Date(me.mobileVerificationExpires) > new Date());
  const askFirst = !me.mobileVerified && !smsFailed && !codeWaiting;

  return (
    <SplitLayout
      title="Verify your mobile"
      lead={
        askFirst ? (
          <>
            We&apos;ll text a 6-digit code to <span className="font-bold text-white">{me.mobile}</span>.
          </>
        ) : smsFailed && !me.mobileVerified ? (
          <>
            Your account is created, but we couldn&apos;t text the code to{' '}
            <span className="font-bold text-white">{me.mobile}</span> just now. Check the number is
            right and tap <span className="font-bold text-white">Resend code</span> below.
          </>
        ) : (
          <>
            We texted a 6-digit code to <span className="font-bold text-white">{me.mobile}</span>.
          </>
        )
      }
    >
      <FormCard>
        {me.mobileVerified ? (
          <>
            <FormSuccess>Your mobile is verified.</FormSuccess>
            <p className="text-[15px] leading-normal text-ink-600">
              {me.emailVerified
                ? 'You’re all set. You can book events now.'
                : 'Now click the confirmation link in your welcome email and you’re all set.'}
            </p>
            <Button block onClick={goOn}>{nextParam ? 'Continue' : 'Browse events'}</Button>
          </>
        ) : askFirst ? (
          <>
            {error && <FormError>{error}</FormError>}
            <Button block onClick={handleResend} disabled={resending} loading={resending}>
              {resending ? 'Sending…' : 'Text me a code'}
            </Button>
            <p className="text-center text-sm text-ink-600">
              Wrong number? <Link href="/account/edit-profile" className={linkClass}>Update your details</Link> first.
            </p>
          </>
        ) : (
          <form onSubmit={handleVerify} className="flex flex-col gap-5">
            <Field label="6-digit code">
              {/* ! because the kit's h-[52px] / text-base would otherwise win:
                  same-utility classes don't override by source order. The
                  extra left padding balances the trailing letter-spacing so
                  the digits sit truly centred. */}
              <TextInput
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="!h-16 pl-[calc(1rem+0.4em)] text-center !text-[28px] font-bold leading-tight tracking-[0.4em] tabular-nums"
              />
            </Field>

            {error && <FormError>{error}</FormError>}
            {notice && <FormSuccess>{notice}</FormSuccess>}

            <Button type="submit" disabled={busy || code.length !== 6} loading={busy} block className="mt-1">
              {busy ? 'Checking…' : 'Verify mobile'}
            </Button>
            <button type="button" onClick={handleResend} disabled={resending} aria-busy={resending || undefined} className={`${linkClass} inline-flex items-center gap-2 self-center text-[15px] disabled:opacity-60`}>
              {resending && <Spinner className="h-4 w-4" />}
              Resend code
            </button>
          </form>
        )}
      </FormCard>
    </SplitLayout>
  );
}

// useSearchParams() (the ?smsFailed flag) forces client-side rendering, which
// Next requires to sit behind a Suspense boundary — without one, `next build`
// fails prerendering this page.
export default function VerifyMobilePage() {
  return (
    <Suspense fallback={null}>
      <VerifyMobileInner />
    </Suspense>
  );
}
