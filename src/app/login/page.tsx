'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SplitLayout, FormCard } from '@/components/site/layout';
import { Field, TextInput, FormError } from '@/components/site/form';
import { Button, linkClass } from '@/components/site/button';
import { safeNext } from '@/lib/safeNext';
import { finishSetupHref, isAdminPath } from '@/lib/accountSetup';
import { NETWORK_ERROR } from '@/lib/networkError';

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Set when the member was sent here mid-action (e.g. tapping "Book this
  // event" while logged out) so they land back where they were instead of a
  // generic events list. Only same-site paths are honoured — see next().
  const nextParam = searchParams.get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // A wrong email or password (not "too many attempts").
  const [wrongDetails, setWrongDetails] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setWrongDetails(false);
    setLoading(true);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setLoading(false);
    if (!res) { setError(NETWORK_ERROR); return; }
    if (!res.ok) {
      setError(data.error ?? 'Login failed.');
      setWrongDetails(res.status === 401 || res.status === 400);
      return;
    }
    // Admins land on the admin dashboard, not the member events list — an
    // explicit ?next= (e.g. bounced off /admin, or off a member page) still
    // wins, so they end up wherever they were actually headed.
    // Only a page on this site (src/lib/safeNext.ts), and an admin page only
    // for an admin: a member would just be told it's for staff.
    let dest = safeNext(nextParam, data.isAdmin ? '/admin' : '/events', window.location.origin);
    if (!data.isAdmin && isAdminPath(dest)) dest = '/events';
    // Something still to do before booking: say what, then carry on there.
    router.push(data.unfinished ? finishSetupHref(dest) : dest);
    router.refresh();
  }

  return (
    <SplitLayout title="Welcome back" lead="Log in to book events, update your profile, or check your matches.">
      <FormCard>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Field label="Email">
            <TextInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
          </Field>
          <Field label="Password">
            <TextInput type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </Field>

          {error && (
            <FormError>
              {error}
              {/* For everyone, so it gives nothing away about the address: an
                  account a friend set up has no password yet, and trying to
                  log in to one emails it a link to set one. */}
              {wrongDetails && (
                <span className="mt-1 block font-normal text-ink-600">
                  Booked in by a friend? Check your email for a link to set your password.
                </span>
              )}
            </FormError>
          )}

          <Button type="submit" disabled={loading} loading={loading} block className="mt-1">
            {loading ? 'Logging in…' : 'Log in'}
          </Button>
        </form>

        <div className="flex flex-col items-center gap-2.5 text-center text-[15px]">
          <Link href="/forgot-password" className={linkClass}>Forgot password?</Link>
          <p className="text-ink-600">
            New to FastMatch?{' '}
            {/* Signing up from here comes back to the same page (an event they were booking, say). */}
            <Link href={nextParam ? `/register?next=${encodeURIComponent(nextParam)}` : '/register'} className={linkClass}>Register free</Link>
          </p>
        </div>
      </FormCard>
    </SplitLayout>
  );
}

// useSearchParams() forces client-side rendering, which Next requires to sit
// behind a Suspense boundary — without one, `next build` fails prerendering.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
