'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, Button, Field, Input } from '@/components/ui';

// SMS verification — enter the 6-digit code sent at registration. The API
// routes (verify-mobile, resend-mobile-code) existed but no screen ever
// collected the code, so mobileVerified could never become true and the
// booking gate blocked every self-registered member.
//
// Session-based: the member is already logged in from registration, so no
// token in the URL — register redirects straight here.

export default function VerifyMobilePage() {
  const router = useRouter();
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
    else setNotice('A new code is on its way to your mobile.');
  }

  if (!loaded) return <p className="text-center text-sm text-ink/50">Loading…</p>;

  if (!me) {
    return (
      <div className="mx-auto max-w-sm text-center">
        <Card>
          <p className="mb-4 text-sm text-ink/60">Log in first, then verify your mobile from here.</p>
          <Link href="/login"><Button className="w-full">Log in</Button></Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Verify your mobile</h1>
      <p className="mb-6 text-sm text-ink/60">
        We texted a 6-digit code to <span className="font-bold text-ink">{me.mobile}</span>.
      </p>

      <Card>
        {me.mobileVerified ? (
          <div className="text-center">
            <p className="mb-1 font-bold text-green-dark">Your mobile is verified.</p>
            <p className="mb-5 text-sm text-ink/60">
              {me.emailVerified
                ? 'You’re all set — you can book events now.'
                : 'Now click the confirmation link in your welcome email and you’re all set.'}
            </p>
            <Button className="w-full" onClick={() => router.push('/events')}>Browse events</Button>
          </div>
        ) : (
          <form onSubmit={handleVerify}>
            <Field label="6-digit code">
              <Input
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="text-center text-lg tracking-[0.4em]"
              />
            </Field>

            {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}
            {notice && <p className="mb-4 text-sm font-medium text-green-dark">{notice}</p>}

            <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
              {busy ? 'Checking…' : 'Verify mobile'}
            </Button>
            <button type="button" onClick={handleResend} className="mt-3 w-full text-center text-sm font-bold text-plum">
              Resend code
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}
