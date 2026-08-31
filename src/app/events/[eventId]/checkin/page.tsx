'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Card } from '@/components/ui';

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

  if (!loaded) return <p className="text-sm text-ink/50">Loading…</p>;

  // Middleware keeps logged-out visitors off this route, so reaching here with
  // no member means an expired or rejected session. ?next= brings them back to
  // this exact check-in page after logging in — on the night of an event they
  // shouldn't have to find their way back.
  if (!me) {
    return (
      <div className="mx-auto max-w-sm text-center">
        <Card>
          <p className="mb-4 text-sm text-ink/60">Please log in to check in for tonight&apos;s event.</p>
          <Link href={`/login?next=${encodeURIComponent(`/events/${eventId}/checkin`)}`}>
            <Button className="w-full">Log in</Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (step === 'confirm' && me) {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="mb-1 text-2xl font-extrabold text-ink">Welcome, {me.name.split(' ')[0]}</h1>
        <p className="mb-6 text-sm text-ink/60">Please confirm your details before you check in for tonight's event.</p>
        <Card className="mb-5 space-y-2 text-sm">
          <div><span className="text-ink/50">Name:</span> <span className="font-bold">{me.name}</span></div>
          <div><span className="text-ink/50">Mobile:</span> <span className="font-bold">{me.mobile}</span></div>
          <div><span className="text-ink/50">Email:</span> <span className="font-bold">{me.email}</span></div>
        </Card>
        {error && (
          <div className="mb-4 rounded-lg border border-coral/30 bg-coral/10 p-3 text-sm">
            <p className="font-bold text-coral">{error}</p>
            <p className="mt-1 text-ink/60">
              Checking in needs a confirmed booking on the account you&apos;re signed in as
              ({me.email}). If that isn&apos;t you,{' '}
              <Link href={`/login?next=${encodeURIComponent(`/events/${eventId}/checkin`)}`} className="font-bold text-plum hover:underline">
                log in as the right member
              </Link>.
            </p>
          </div>
        )}
        <Button onClick={handleCheckIn} disabled={checkingIn} className="w-full">
          {checkingIn ? 'Checking in…' : 'Confirm & check in'}
        </Button>
      </div>
    );
  }

  if (step === 'roster') {
    return (
      <div className="mx-auto max-w-lg">
        <div className="mb-5 rounded-xl bg-gradient-to-br from-plum to-plum-dark p-5 text-center text-white">
          <div className="text-xs font-bold uppercase tracking-wide text-white/70">Your number tonight</div>
          <div className="text-4xl font-extrabold">{String(myBadge).padStart(2, '0')}</div>
        </div>

        <div className="mb-3 flex items-center gap-2 text-sm text-ink/60">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green" />
          <span className="font-bold text-green-dark">{roster.length} checked in</span>
          <span>— tap a name once you've met them.</span>
        </div>

        <div className="space-y-2">
          {roster.filter((r) => r.memberId !== me?.id).map((person) => (
            <button
              key={person.memberId}
              onClick={() => setActivePerson(person)}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${ratings[person.memberId] ? 'border-green bg-green/10' : 'border-ink/10 bg-white'}`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-plum/10 font-extrabold text-plum">{String(person.badge).padStart(2, '0')}</span>
              <span className="flex-1 font-bold text-ink">{person.name}</span>
              <span className="text-xs font-bold uppercase text-ink/40">{ratings[person.memberId] ?? 'Tap to rate'}</span>
            </button>
          ))}
        </div>

        {activePerson && (
          <div className="fixed inset-0 flex items-end justify-center bg-ink/40 sm:items-center" onClick={() => setActivePerson(null)}>
            <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
              <h2 className="mb-4 text-xl font-extrabold text-ink">{activePerson.name}</h2>
              {(['DATE', 'FRIEND', 'NO'] as Choice[]).map((choice) => (
                <button
                  key={choice}
                  onClick={() => { selectRating(activePerson.memberId, choice); setActivePerson(null); }}
                  className="mb-2 w-full rounded-xl border border-ink/10 p-3 text-left font-bold hover:border-green"
                >
                  {choice === 'DATE' ? 'Date' : choice === 'FRIEND' ? 'Friend' : 'No'}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="mt-4 text-sm font-medium text-coral">{error}</p>}
        <Button onClick={handleSubmitMatches} disabled={submitting} className="mt-5 w-full">
          {submitting ? 'Submitting…' : 'Submit matches'}
        </Button>
        <p className="mt-2 text-center text-xs text-ink/40">Your matches will be processed automatically at midnight tonight.</p>
      </div>
    );
  }

  if (step === 'submitted') {
    return (
      <div className="mx-auto max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green/15 text-3xl text-green-dark">✓</div>
        <h1 className="mb-2 text-2xl font-extrabold text-ink">Matches submitted</h1>
        <p className="mb-6 text-sm text-ink/60">Your matches are processed automatically at midnight tonight — you'll get an email, and it'll show on the My Matches page too.</p>
        <a href="/matches"><Button className="w-full">Go to My Matches</Button></a>
      </div>
    );
  }

  return null;
}
