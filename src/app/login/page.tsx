'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Field, Input, Button, Card } from '@/components/ui';

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
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? 'Login failed.');
      return;
    }
    // Admins land on the admin dashboard, not the member events list — an
    // explicit ?next= (e.g. bounced off /admin, or off a member page) still
    // wins, so they end up wherever they were actually headed.
    router.push(safeNext(nextParam, data.isAdmin ? '/admin' : '/events'));
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Welcome back</h1>
      <p className="mb-6 text-sm text-ink/60">Log in to book events, update your profile, or check your matches.</p>

      <Card>
        <form onSubmit={handleSubmit}>
          <Field label="Email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
          </Field>
          <Field label="Password">
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </Field>

          {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Logging in…' : 'Log in'}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="font-bold text-plum">Forgot password?</Link>
        </div>
        <div className="mt-2 text-center text-sm text-ink/60">
          New to FastMatch? <Link href="/register" className="font-bold text-plum">Register free</Link>
        </div>
      </Card>
    </div>
  );
}

// `next` arrives from the URL, so it is attacker-controllable: a link to
// /login?next=https://evil.example would otherwise bounce a member straight
// off-site immediately after they typed their password. Only same-site
// absolute paths are allowed — and "//host" is rejected too, since browsers
// read it as a protocol-relative URL to another origin.
function safeNext(next: string | null, fallback: string): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback;
  return next;
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
