'use client';

import { Suspense, useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { SplitLayout, FormCard, LoadingNote } from '@/components/site/layout';
import { Field, TextInput, FormError, FormSuccess } from '@/components/site/form';
import { Button, ButtonLink, linkClass } from '@/components/site/button';
import { NETWORK_ERROR } from '@/lib/networkError';

// Landing page for the link in the "confirm your email to finish joining"
// email (`${APP_URL}/complete-signup?token=...`). Opening it creates the
// account and signs the member in; see /api/auth/complete-signup.
//
// Opened in a different browser from the one the sign-up form was filled in
// (a phone's mail app, say), the API first asks for the password chosen on
// the form, so someone who signed up a stranger's address can't be handed
// the account when its owner clicks the link. The page then shows a password
// box; in the same browser nothing changes.

/** What the API answers when it wants the sign-up password first. */
const PASSWORD_CODES = ['PASSWORD_NEEDED', 'PASSWORD_WRONG', 'TOO_MANY'];

function CompleteSignupInner() {
  const token = useSearchParams().get('token');
  const router = useRouter();
  const [state, setState] = useState<'working' | 'password' | 'done' | 'error'>('working');
  // The password box (another browser): what was typed, the API's request or
  // complaint, and whether it's being checked.
  const [password, setPassword] = useState('');
  const [askText, setAskText] = useState('For your security, please enter the password you chose when you signed up.');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [smsSent, setSmsSent] = useState(true);
  // Where they were going when they signed up (checked by the server).
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState('This link has expired or has already been used. Please sign up again.');
  const [alreadyMember, setAlreadyMember] = useState(false);
  // The link works once; never send it twice (React can run an effect twice in development).
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    if (!token) {
      setState('error');
      setError('This link is missing part of its code. Please use the full link from your email.');
      return;
    }
    finish(token).catch(() => setState('error'));
  }, [token, router]); // finish only uses the state setters and the router

  /** Asks for the account to be made, with the password when it's been asked for. */
  async function finish(linkToken: string, typedPassword?: string) {
    const r = await fetch('/api/auth/complete-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: linkToken, ...(typedPassword !== undefined ? { password: typedPassword } : {}) }),
    });
    const data = await r.json().catch(() => null);
    if (r.ok) {
      setSmsSent(data?.smsSent !== false);
      setNext(typeof data?.next === 'string' ? data.next : null);
      setState('done');
      router.refresh(); // signed in now: the header should say so
      return;
    }
    if (typeof data?.code === 'string' && PASSWORD_CODES.includes(data.code)) {
      if (data.code === 'PASSWORD_NEEDED') {
        if (typeof data.error === 'string') setAskText(data.error);
        setPasswordError(null);
      } else {
        setPasswordError(typeof data.error === 'string' ? data.error : 'Please try again.');
      }
      setState('password');
      return;
    }
    if (data?.error) setError(data.error);
    setAlreadyMember(r.status === 409);
    setState('error');
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setChecking(true);
    setPasswordError(null);
    try {
      await finish(token, password);
    } catch {
      setPasswordError(NETWORK_ERROR);
    } finally {
      setChecking(false);
    }
  }

  return (
    <SplitLayout title="Welcome to FastMatch">
      <FormCard>
        {state === 'working' && <LoadingNote>Setting up your account…</LoadingNote>}
        {state === 'password' && (
          <form onSubmit={handlePassword} className="flex flex-col gap-5">
            <p className="text-[15px] leading-normal text-ink-600">{askText}</p>
            <Field label="Password" error={passwordError}>
              <PasswordInput required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button type="submit" disabled={checking || !password} loading={checking} block className="mt-1">
              {checking ? 'Checking…' : 'Finish joining'}
            </Button>
            <Link href="/register" className={`${linkClass} self-center text-center text-[15px]`}>Forgotten it? Sign up again with the same email</Link>
          </form>
        )}
        {state === 'done' && (
          <>
            <FormSuccess>Your email is confirmed and your account is ready.</FormSuccess>
            <p className="text-[15px] leading-normal text-ink-600">
              {smsSent
                ? 'Last step: enter the 6-digit code we’ve just texted to your mobile. Then you can book events.'
                : 'Last step: confirm your mobile. We couldn’t text your code just now, so check your number and tap “Resend code” on the next page.'}
            </p>
            <ButtonLink href={verifyMobileLink(smsSent, next)} block>Enter SMS code</ButtonLink>
          </>
        )}
        {state === 'error' && (
          <>
            <FormError>{error}</FormError>
            {alreadyMember ? (
              <ButtonLink href="/login" block>Log in</ButtonLink>
            ) : (
              <>
                <ButtonLink href="/register" block>Sign up</ButtonLink>
                <Link href="/login" className={`${linkClass} self-center text-[15px]`}>Already a member? Log in</Link>
              </>
            )}
          </>
        )}
      </FormCard>
    </SplitLayout>
  );
}

/**
 * A password box with a Show / Hide button inside its right-hand end, so the
 * password can be checked before it's sent (it was chosen some time ago, maybe
 * on another device).
 */
function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <TextInput {...props} type={shown ? 'text' : 'password'} className="pr-20" />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-pressed={shown}
        aria-label={shown ? 'Hide password' : 'Show password'}
        className={`${linkClass} absolute right-4 top-1/2 -translate-y-1/2 text-[15px]`}
      >
        {shown ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

function verifyMobileLink(smsSent: boolean, next: string | null): string {
  const q = new URLSearchParams();
  if (!smsSent) q.set('smsFailed', '1');
  if (next) q.set('next', next);
  const qs = q.toString(); // not q.size: older Safari doesn't have it
  return `/verify-mobile${qs ? `?${qs}` : ''}`;
}

export default function CompleteSignupPage() {
  // useSearchParams requires a Suspense boundary during prerender
  return (
    <Suspense fallback={null}>
      <CompleteSignupInner />
    </Suspense>
  );
}
