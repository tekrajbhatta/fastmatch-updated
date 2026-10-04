'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SplitLayout, FormCard, LoadingNote } from '@/components/site/layout';
import { Button, ButtonLink, linkClass } from '@/components/site/button';
import { FormError, Notice } from '@/components/site/form';
import ResendConfirmation from '@/components/ResendConfirmation';
import { safeNext } from '@/lib/safeNext';
import { unfinishedSteps, finishSetupHref, verifyMobileHref } from '@/lib/accountSetup';

interface Me { email: string; mobile: string; emailVerified: boolean; mobileVerified: boolean; agreedTerms: boolean }

/**
 * "Finish setting up your account" — where a member with something still to
 * do before booking lands after logging in, and where the event page's
 * "Confirm your email" and "Accept the terms" links lead. Each unfinished
 * step with what sorts it out; then on to wherever they were going (?next=).
 * Nothing here is compulsory: "Skip for now" always carries on.
 */
function FinishSetupInner() {
  const nextParam = useSearchParams().get('next');
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [next, setNext] = useState('/events');

  useEffect(() => {
    setNext(safeNext(nextParam, '/events', window.location.origin));
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => setMe(d.member))
      .finally(() => setLoaded(true));
  }, [nextParam]);

  async function acceptTerms() {
    setError(null);
    setAccepting(true);
    const res = await fetch('/api/account/accept-terms', { method: 'POST' }).catch(() => null).finally(() => setAccepting(false));
    if (!res?.ok) { setError('That didn’t work. Please try again.'); return; }
    setMe((m) => (m ? { ...m, agreedTerms: true } : m));
  }

  if (!loaded) {
    return (
      <SplitLayout title="Finish setting up your account">
        <FormCard><LoadingNote>Loading…</LoadingNote></FormCard>
      </SplitLayout>
    );
  }
  if (!me) {
    return (
      <SplitLayout title="Finish setting up your account">
        <FormCard>
          <p className="text-[15px] leading-normal text-ink-600">Your session has expired. Please log in again.</p>
          <ButtonLink href={`/login?next=${encodeURIComponent(finishSetupHref(next))}`} block>Log in</ButtonLink>
        </FormCard>
      </SplitLayout>
    );
  }

  const steps = unfinishedSteps(me);
  // After the mobile code, back here if something else is still to do.
  const afterMobile = steps.some((s) => s !== 'mobile') ? finishSetupHref(next) : next;

  return (
    <SplitLayout
      title={steps.length ? 'Finish setting up your account' : 'You’re all set'}
      lead={steps.length ? 'A few things to do before you can book events.' : 'Your account is ready. You can book events now.'}
    >
      <FormCard>
        {steps.includes('email') && (
          <Notice className="flex flex-col gap-3">
            <p className="font-bold">Confirm your email address</p>
            <p className="text-ink-600">
              Click the link in the email we sent to <span className="[overflow-wrap:anywhere]">{me.email}</span>, or get a new one:
            </p>
            <ResendConfirmation />
          </Notice>
        )}
        {steps.includes('mobile') && (
          <Notice className="flex flex-col gap-3">
            <p className="font-bold">Confirm your mobile number</p>
            <p className="text-ink-600">We text a 6-digit code to {me.mobile}.</p>
            <ButtonLink href={verifyMobileHref(afterMobile)} block>Confirm your mobile</ButtonLink>
          </Notice>
        )}
        {steps.includes('terms') && (
          <Notice className="flex flex-col gap-3">
            <p className="font-bold">Accept our Terms &amp; Conditions</p>
            <p className="text-ink-600">
              Please read our <Link href="/terms" className={linkClass}>Terms &amp; Conditions</Link> and{' '}
              <Link href="/privacy" className={linkClass}>Privacy Policy</Link>.
            </p>
            {error && <FormError>{error}</FormError>}
            <Button onClick={acceptTerms} disabled={accepting} loading={accepting} block className="!h-auto min-h-[54px] !whitespace-normal py-3 leading-snug">
              I agree to the Terms &amp; Privacy Policy
            </Button>
          </Notice>
        )}

        {steps.length === 0 ? (
          <ButtonLink href={next} block>Continue</ButtonLink>
        ) : (
          <Link href={next} className={`${linkClass} self-center text-[15px]`}>Skip for now</Link>
        )}
      </FormCard>
    </SplitLayout>
  );
}

// useSearchParams() needs a Suspense boundary, or `next build` fails prerendering.
export default function FinishSetupPage() {
  return (
    <Suspense fallback={null}>
      <FinishSetupInner />
    </Suspense>
  );
}
