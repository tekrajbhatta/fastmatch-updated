'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SplitLayout, FormCard, LoadingNote } from '@/components/site/layout';
import { Field, TextInput, FormError, FormSuccess } from '@/components/site/form';
import { Button, ButtonLink, linkClass } from '@/components/site/button';

// SMS verification — enter the 6-digit code sent at registration. The API
// routes (verify-mobile, resend-mobile-code) existed but no screen ever
// collected the code, so mobileVerified could never become true and the
// booking gate blocked every self-registered member.
//
// Session-based: the member is already logged in from registration, so no
// token in the URL — register redirects straight here.

function VerifyMobileInner() {
  const router = useRouter();
  // register redirects here with ?smsFailed=1 when the verification text
  // couldn't be sent, so the page doesn't claim a code is on its way when it
  // isn't. Cleared as soon as Resend succeeds.
  const [smsFailed, setSmsFailed] = useState(useSearchParams().get('smsFailed') === '1');
  const [me, setMe] = useState<{ mobileVerified: boolean; emailVerified: boolean; mobile: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      setError(data.error ?? 'Verification failed — try again.');
      return;
    }
    setMe((m) => (m ? { ...m, mobileVerified: true } : m));
  }

  async function handleResend() {
    setError(null);
    setNotice(null);
    const res = await fetch('/api/auth/resend-mobile-code', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? 'Could not resend the code.');
    else {
      setSmsFailed(false);
      setNotice('A new code is on its way to your mobile.');
    }
  }

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

  return (
    <SplitLayout
      title="Verify your mobile"
      lead={
        smsFailed && !me.mobileVerified ? (
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
                ? 'You’re all set — you can book events now.'
                : 'Now click the confirmation link in your welcome email and you’re all set.'}
            </p>
            <Button block onClick={() => router.push('/events')}>Browse events</Button>
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

            <Button type="submit" disabled={busy || code.length !== 6} block className="mt-1">
              {busy ? 'Checking…' : 'Verify mobile'}
            </Button>
            <button type="button" onClick={handleResend} className={`${linkClass} self-center text-[15px]`}>
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
