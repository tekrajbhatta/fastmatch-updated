'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Container, FormCard, PageLoader, SplitLayout } from '@/components/site/layout';
import { Button, ButtonLink } from '@/components/site/button';
import { FormError, Notice } from '@/components/site/form';
import { NETWORK_ERROR } from '@/lib/networkError';
import ResendConfirmation from '@/components/ResendConfirmation';
import { verifyMobileHref } from '@/lib/accountSetup';

interface Me { id: string; name: string; email: string; agreedTerms: boolean; isAdmin: boolean; emailVerified: boolean; mobileVerified: boolean; mobile: string; marketingOptIn: boolean; }

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  // Tracked separately from `me`. Testing `!me` alone can't tell "the fetch
  // hasn't come back yet" apart from "logged out", so every member saw a
  // flash of "Please log in" before their own account loaded.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => setMe(data.member))
      .finally(() => setLoaded(true));
  }, []);

  // Both buttons show a spinner while their request runs. Log out stays busy
  // through the redirect to /login, which itself takes a moment.
  const [loggingOut, setLoggingOut] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  async function acceptTerms() {
    setAccepting(true);
    setTermsError(null);
    const res = await fetch('/api/account/accept-terms', { method: 'POST' }).catch(() => null).finally(() => setAccepting(false));
    // Only once it's saved: the notice used to go whatever the answer, and
    // the next booking was then refused for terms not accepted.
    if (!res) { setTermsError(NETWORK_ERROR); return; }
    if (res.status === 401) { setTermsError('Your session has expired. Please log in again.'); return; }
    if (!res.ok) { setTermsError('Sorry, that didn’t save. Please try again.'); return; }
    setMe((m) => (m ? { ...m, agreedTerms: true } : m));
  }

  if (!loaded) {
    return (
      <Container>
        <PageLoader />
      </Container>
    );
  }

  // Middleware keeps logged-out visitors off this page entirely, so reaching
  // here without a member means a session that expired or was rejected.
  // ?next= brings them back here once they log in again.
  if (!me) {
    return (
      <div className="flex flex-1 items-start justify-center px-4 py-[clamp(40px,7.2vw,104px)]">
        <FormCard className="text-center">
          <p className="text-base leading-relaxed text-ink-600">Your session has expired. Please log in again.</p>
          <ButtonLink href="/login?next=%2Faccount" block>Log in</ButtonLink>
        </FormCard>
      </div>
    );
  }

  return (
    <SplitLayout
      title="My account"
      // A long address has no spaces to wrap at, so let it break anywhere
      // rather than push the panel wider than a phone screen.
      lead={<>{me.name} · <span className="[overflow-wrap:anywhere]">{me.email}</span></>}
    >
      <FormCard>
        {!me.agreedTerms && (
          <Notice className="flex flex-col gap-3">
            <p className="font-bold text-ink-900">Please accept our Terms &amp; Conditions to book events.</p>
            {/* The label is too long for one line on a phone, so this one
                button may wrap onto two. */}
            <Button onClick={acceptTerms} disabled={accepting} loading={accepting} block className="!h-auto min-h-[54px] !whitespace-normal py-3 leading-snug">
              I agree to the Terms &amp; Privacy Policy
            </Button>
            {termsError && <FormError>{termsError}</FormError>}
          </Notice>
        )}

        {!me.emailVerified && (
          <Notice className="flex flex-col gap-3">
            <p className="font-bold text-ink-900">Your email address isn&apos;t confirmed yet, so you can&apos;t book events.</p>
            <p className="text-[15px] text-ink-600">Use the link in the email we sent you, or get a new one:</p>
            <ResendConfirmation />
          </Notice>
        )}

        {!me.mobileVerified && (
          <Notice className="flex flex-col gap-3">
            <p className="font-bold text-ink-900">Your mobile number isn&apos;t confirmed yet, so you can&apos;t book events.</p>
            <p className="text-[15px] text-ink-600">We text a 6-digit code to {me.mobile}.</p>
            <ButtonLink href={verifyMobileHref('/account')} block>Confirm your mobile</ButtonLink>
          </Notice>
        )}

        {/* Confirmation status at a glance; anything unconfirmed has its notice above. */}
        <dl className="flex flex-col gap-1 text-[15px]">
          <StatusRow label="Email address" ok={me.emailVerified} />
          <StatusRow label="Mobile number" ok={me.mobileVerified} />
          {/* Blasts: theirs to turn on or off (Gil, Q15). Not for an admin account. */}
          {!me.isAdmin && (
            <div className="flex justify-between gap-4">
              <dt className="text-ink-600">Event news and offers</dt>
              <dd className="font-bold text-ink-900">{me.marketingOptIn ? 'Subscribed' : 'Not subscribed'}</dd>
            </div>
          )}
        </dl>

        <ul className="divide-y divide-line">
          {/* Only actions that belong to THIS member's account. Contact us,
              Privacy policy and Terms & conditions all live in the site footer
              on every page, for every role, so listing them here as well was a
              second route to the same three pages. */}
          <AccountLink href="/account/edit-profile" label="Edit profile" />
          <AccountLink href="/account/change-password" label="Change password" />
          {/* Marketing is for members; an admin account has nothing to
              unsubscribe from. Unsubscribing stops texts as well as emails. */}
          {!me.isAdmin && (
            <AccountLink href="/account/unsubscribe" label={me.marketingOptIn ? 'Unsubscribe from event news and offers' : 'Subscribe to event news and offers'} />
          )}
        </ul>

        <Button variant="secondary" block onClick={handleLogout} disabled={loggingOut} loading={loggingOut}>Log out</Button>
      </FormCard>
    </SplitLayout>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-600">{label}</dt>
      <dd className={`font-bold ${ok ? 'text-ink-900' : 'text-error-700'}`}>{ok ? '✓ Confirmed' : 'Not confirmed'}</dd>
    </div>
  );
}

function AccountLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="group flex min-h-[60px] items-center justify-between gap-4 rounded-sm py-3 text-[17px] font-bold text-ink-900 transition-colors hover:text-plum-700 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-plum-700"
      >
        {label}
        <span
          aria-hidden="true"
          className="mr-1.5 h-[9px] w-[9px] flex-none -rotate-45 border-b-2 border-r-2 border-plum-700 transition-transform group-hover:translate-x-1"
        />
      </Link>
    </li>
  );
}
