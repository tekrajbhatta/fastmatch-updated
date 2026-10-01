'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Container, DecorRing, FormCard, SplitLayout, PageLoader } from '@/components/site/layout';
import { FormError } from '@/components/site/form';
import { Button, ButtonLink, buttonClass, linkClass } from '@/components/site/button';

interface Me { id: string; name: string; email: string; mobile: string; }
interface RosterEntry { badge: number; memberId: string; name: string; }
type Choice = 'NO' | 'FRIEND' | 'DATE';

export default function CheckinPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [me, setMe] = useState<Me | null>(null);
  const [step, setStep] = useState<'loading' | 'confirm' | 'roster' | 'submitted'>('loading');
  // Tracked separately from `step`. Previously a logged-out visitor and a
  // still-loading page were the SAME 'loading' step, so the "Please log in"
  // message flashed at every member before their own details appeared.
  const [loaded, setLoaded] = useState(false);
  const [myBadge, setMyBadge] = useState<number | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [ratings, setRatings] = useState<Record<string, Choice>>({});
  const [activePerson, setActivePerson] = useState<RosterEntry | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        setMe(data.member);
        if (data.member) setStep('confirm');
      })
      .finally(() => setLoaded(true));
  }, []);

  async function loadRoster() {
    const res = await fetch(`/api/events/${eventId}/checkin`);
    if (res.ok) setRoster(await res.json());
    else setError('Checked in, but the attendee list could not be loaded. Pull down to refresh.');
  }

  async function handleCheckIn() {
    setError(null);
    setCheckingIn(true);
    const res = await fetch(`/api/events/${eventId}/checkin`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setCheckingIn(false);

    // The response used to be discarded unless it was ok, so a rejected
    // check-in left the button doing visibly nothing at all. The common
    // rejection is a 403 "No confirmed booking found for this event." — which
    // is exactly what happens if someone opens the venue QR while signed in
    // as a different account (an admin, say) than the one that booked.
    if (!res.ok) {
      setError(
        typeof data.error === 'string'
          ? data.error
          : 'We could not check you in. Please show this screen to the host.'
      );
      return;
    }

    setMyBadge(data.badge);
    await loadRoster();
    setStep('roster');
  }

  function selectRating(memberId: string, choice: Choice) {
    setRatings((r) => ({ ...r, [memberId]: choice }));
  }

  async function handleSubmitMatches() {
    setError(null);
    setSubmitting(true);
    const payload = Object.entries(ratings).map(([ratedMemberId, choice]) => ({ ratedMemberId, choice }));
    const res = await fetch(`/api/events/${eventId}/ratings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ratings: payload }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    // Same failure mode as check-in: silently doing nothing on the last screen
    // of the night would lose someone's ratings with no way to tell.
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Your matches could not be submitted. Please try again.');
      return;
    }
    setStep('submitted');
  }

  if (!loaded) return <Container><PageLoader /></Container>;

  // Middleware keeps logged-out visitors off this route, so reaching here with
  // no member means an expired or rejected session. ?next= brings them back to
  // this exact check-in page after logging in — on the night of an event they
  // shouldn't have to find their way back.
  if (!me) {
    return (
      <Container className="flex justify-center py-[clamp(48px,7vw,96px)]">
        <FormCard className="text-center">
          <p className="text-base text-ink-600">Please log in to check in for tonight&apos;s event.</p>
          <ButtonLink href={`/login?next=${encodeURIComponent(`/events/${eventId}/checkin`)}`} block>Log in</ButtonLink>
        </FormCard>
      </Container>
    );
  }

  if (step === 'confirm' && me) {
    return (
      <SplitLayout
        title={`Welcome, ${me.name.split(' ')[0]}`}
        lead="Please confirm your details before you check in for tonight's event."
      >
        <FormCard>
          <dl className="divide-y divide-line">
            <DetailRow label="Name" value={me.name} />
            <DetailRow label="Mobile" value={me.mobile} />
            <DetailRow label="Email" value={me.email} />
          </dl>
          {error && (
            <FormError>
              <p>{error}</p>
              <p className="mt-1 font-normal text-ink-600">
                Checking in needs a confirmed booking on the account you&apos;re signed in as
                ({me.email}). If that isn&apos;t you,{' '}
                <Link href={`/login?next=${encodeURIComponent(`/events/${eventId}/checkin`)}`} className={linkClass}>
                  log in as the right member
                </Link>.
              </p>
            </FormError>
          )}
          <Button onClick={handleCheckIn} disabled={checkingIn} loading={checkingIn} block>
            {checkingIn ? 'Checking in…' : 'Confirm & check in'}
          </Button>
        </FormCard>
      </SplitLayout>
    );
  }

  if (step === 'roster') {
    return (
      <Container className="py-[clamp(24px,4vw,56px)]">
        <div className="mx-auto max-w-[560px]">
          <div className="relative overflow-hidden rounded-bubble bg-plum-900 px-6 py-7 text-center">
            <DecorRing className="-right-10 -top-16 w-40 opacity-60" />
            <p className="relative text-[13px] font-extrabold uppercase tracking-[0.1em] text-plum-200">Your number tonight</p>
            <p className="relative mt-1 font-display text-[64px] font-extrabold leading-none tracking-[-0.03em] text-match-300">{String(myBadge).padStart(2, '0')}</p>
          </div>

          <div className="mb-3 mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-ink-600">
            <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-match-400" />
            <span className="font-bold text-plum-700">{roster.length} checked in.</span>
            <span>Tap a name once you've met them.</span>
          </div>

          <div className="space-y-2.5">
            {roster.filter((r) => r.memberId !== me?.id).map((person) => (
              <button
                key={person.memberId}
                onClick={() => setActivePerson(person)}
                className={`flex w-full items-center gap-3 rounded-[20px] border-[1.5px] p-3 text-left transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-plum-700 ${ratings[person.memberId] ? 'border-plum-700 bg-plum-50' : 'border-line bg-white hover:border-plum-700'}`}
              >
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[20px_20px_20px_5px] bg-plum-100 font-display font-extrabold text-plum-700">{String(person.badge).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1 font-bold text-ink-900">{person.name}</span>
                <span className={ratings[person.memberId]
                  ? 'rounded-[999px_999px_999px_4px] bg-match-400 px-2.5 py-1 text-xs font-extrabold uppercase text-plum-900'
                  : 'text-xs font-bold uppercase text-ink-500'}
                >
                  {ratings[person.memberId] ?? 'Tap to rate'}
                </span>
              </button>
            ))}
          </div>

          {activePerson && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-plum-950/60 sm:items-center" onClick={() => setActivePerson(null)}>
              <div className="w-full max-w-sm rounded-t-[28px] bg-white p-6 pb-8 sm:rounded-[28px] sm:pb-6" onClick={(e) => e.stopPropagation()}>
                <h2 className="mb-4 font-display text-2xl font-extrabold tracking-[-0.02em] text-ink-900">{activePerson.name}</h2>
                {(['DATE', 'FRIEND', 'NO'] as Choice[]).map((choice) => (
                  <button
                    key={choice}
                    onClick={() => { selectRating(activePerson.memberId, choice); setActivePerson(null); }}
                    className="mb-2.5 w-full rounded-field border-[1.5px] border-field p-4 text-left text-[17px] font-bold text-ink-900 transition-colors hover:border-plum-700 hover:bg-plum-50 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-plum-700"
                  >
                    {choice === 'DATE' ? 'Date' : choice === 'FRIEND' ? 'Friend' : 'No'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <FormError className="mt-4">{error}</FormError>}
          <Button onClick={handleSubmitMatches} disabled={submitting} loading={submitting} block className="mt-6">
            {submitting ? 'Submitting…' : 'Submit matches'}
          </Button>
          <p className="mt-3 text-center text-sm text-ink-600">Your matches will be processed automatically at midnight tonight.</p>
        </div>
      </Container>
    );
  }

  if (step === 'submitted') {
    return (
      <Container className="py-[clamp(40px,6vw,88px)]">
        <div className="relative mx-auto flex max-w-[640px] flex-col items-center gap-4 overflow-hidden rounded-[clamp(28px,3.3vw,48px)_clamp(28px,3.3vw,48px)_clamp(28px,3.3vw,48px)_10px] bg-plum-900 px-[clamp(24px,4.4vw,64px)] py-[clamp(40px,5vw,72px)] text-center">
          <DecorRing className="-right-16 -top-20 w-[clamp(160px,20vw,240px)] opacity-60" />
          <span aria-hidden="true" className="relative flex h-16 w-16 items-center justify-center rounded-[32px_32px_32px_8px] bg-match-400 font-display text-3xl font-extrabold text-plum-900">✓</span>
          <h1 className="relative font-display text-[clamp(34px,4vw,52px)] font-extrabold leading-[1.05] tracking-[-0.03em] text-white">Matches submitted</h1>
          <p className="relative max-w-[460px] text-[17px] leading-normal text-plum-200 text-pretty">Your matches are processed automatically at midnight tonight. You'll get an email, and it'll show on your My Match History page too.</p>
          <a href="/matches" className={`relative mt-2 ${buttonClass({ onDark: true })}`}>Go to My Match History</a>
        </div>
      </Container>
    );
  }

  return null;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-3 text-[15px] first:pt-0">
      <dt className="text-ink-600">{label}</dt>
      <dd className="min-w-0 break-words text-right font-bold text-ink-900">{value}</dd>
    </div>
  );
}
