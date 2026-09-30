'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FormCard, LoadingNote, SplitLayout } from '@/components/site/layout';
import { Button, ButtonLink } from '@/components/site/button';
import { Notice } from '@/components/site/form';

interface Me { id: string; name: string; email: string; agreedTerms: boolean; }

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

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  async function acceptTerms() {
    await fetch('/api/account/accept-terms', { method: 'POST' });
    setMe((m) => (m ? { ...m, agreedTerms: true } : m));
  }

  if (!loaded) {
    return (
      <div className="flex flex-1 justify-center px-4 py-[clamp(40px,7.2vw,104px)]">
        <LoadingNote />
      </div>
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
            <Button onClick={acceptTerms} block className="!h-auto min-h-[54px] !whitespace-normal py-3 leading-snug">
              I agree to the Terms &amp; Privacy Policy
            </Button>
          </Notice>
        )}

        <ul className="divide-y divide-line">
          {/* Only actions that belong to THIS member's account. Contact us,
              Privacy policy and Terms & conditions all live in the site footer
              on every page, for every role, so listing them here as well was a
              second route to the same three pages. */}
          <AccountLink href="/account/edit-profile" label="Edit profile" />
          <AccountLink href="/account/change-password" label="Change password" />
          <AccountLink href="/account/unsubscribe" label="Unsubscribe from emails" />
        </ul>

        <Button variant="secondary" block onClick={handleLogout}>Log out</Button>
      </FormCard>
    </SplitLayout>
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
