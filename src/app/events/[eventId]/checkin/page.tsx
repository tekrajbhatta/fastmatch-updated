'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Container, DecorRing, FormCard, SplitLayout, PageLoader } from '@/components/site/layout';
import { FormError } from '@/components/site/form';
import { Button, ButtonLink, buttonClass, linkClass } from '@/components/site/button';
import { eventClock } from '@/lib/timezone';

interface Me { id: string; name: string; email: string; mobile: string; }
interface RosterEntry { badge: number; memberId: string; name: string; }
type Choice = 'NO' | 'FRIEND' | 'DATE';

/** Where the member stands tonight (GET /api/events/:id/night). */
interface Night {
  event: { name: string; theme: string; startsAt: string; city: string; cancelled: boolean };
  checkIn: 'not-yet' | 'open' | 'closed';
  opensAt: string;
  closesAt: string;
  booking: { checkedIn: boolean; badge: number } | null;
  choicesOpen: boolean;
  matchesCalculated: boolean;
  myChoices: Record<string, Choice>;
}

/** Late arrivals appear on the list without anyone reloading. */
const REFRESH_EVERY_MS = 25_000;

// Choices not yet sent are kept in the browser, so a reload (or the phone
// locking) doesn't lose them. Best-effort: private browsing can refuse.
const draftKey = (eventId: string, memberId: string) => `fm-choices:${eventId}:${memberId}`;
function readDraft(key: string): Record<string, Choice> {
  try { return JSON.parse(localStorage.getItem(key) ?? '{}') ?? {}; } catch { return {}; }
}
function writeDraft(key: string, ratings: Record<string, Choice>) {
  try { localStorage.setItem(key, JSON.stringify(ratings)); } catch { /* not kept; no harm */ }
}
function clearDraft(key: string) {
  try { localStorage.removeItem(key); } catch { /* nothing to clear */ }
}

export default function CheckinPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [me, setMe] = useState<Me | null>(null);
  const [night, setNight] = useState<Night | null>(null);
  const [step, setStep] = useState<'loading' | 'confirm' | 'roster' | 'submitted' | 'closed'>('loading');
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
  const [closedMessage, setClosedMessage] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const draft = useRef<string | null>(null);

  const loadRoster = useCallback(async () => {
    setRefreshing(true);
    const res = await fetch(`/api/events/${eventId}/checkin`).catch(() => null);
    setRefreshing(false);
    if (res?.ok) { setRoster(await res.json()); setError(null); }
    else setError('Checked in, but the attendee list could not be loaded. Tap Refresh to try again.');
  }, [eventId]);

  // Choices already sent, plus any not yet sent from an earlier visit.
  const startRating = useCallback((member: Me, n: Night) => {
    draft.current = draftKey(eventId, member.id);
    setRatings({ ...n.myChoices, ...readDraft(draft.current) });
    setMyBadge(n.booking?.badge ?? null);
    loadRoster();
    setStep('roster');
  }, [eventId, loadRoster]);

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me').then((r) => r.json()).catch(() => ({})),
      fetch(`/api/events/${eventId}/night`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([meData, n]: [{ member?: Me | null }, Night | null]) => {
      const member = meData?.member ?? null;
      setMe(member);
      setNight(n);
      if (!member) return;
      if (n?.booking?.checkedIn) {
        // Back on the page later (a reload, the phone locked): straight to the list.
        if (!n.choicesOpen) {
          setClosedMessage(n.matchesCalculated
            ? 'The matches for this event have been worked out, so choices can no longer be sent.'
            : 'Choices for this event closed at midnight.');
          setStep('closed');
        } else startRating(member, n);
      } else setStep('confirm');
    }).finally(() => setLoaded(true));
  }, [eventId, startRating]);

  // Late arrivals appear on their own.
  useEffect(() => {
    if (step !== 'roster') return;
    const timer = setInterval(loadRoster, REFRESH_EVERY_MS);
    return () => clearInterval(timer);
  }, [step, loadRoster]);

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

    if (me && night) startRating(me, { ...night, booking: { checkedIn: true, badge: data.badge } });
  }

  function selectRating(memberId: string, choice: Choice) {
    setRatings((r) => {
      const next = { ...r, [memberId]: choice };
      if (draft.current) writeDraft(draft.current, next);
      return next;
    });
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
    // Too late: choices have closed (midnight, or the results are in).
    if (res.status === 409 && data.closed) {
      setClosedMessage(typeof data.error === 'string' ? data.error : 'Choices for this event have closed.');
      setStep('closed');
      return;
    }
    // Same failure mode as check-in: silently doing nothing on the last screen
    // of the night would lose someone's ratings with no way to tell.
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Your matches could not be submitted. Please try again.');
      return;
    }
    if (draft.current) clearDraft(draft.current);
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

  // Not open yet, or closed: say so, rather than a check-in button.
  if (step === 'confirm' && me && night && night.checkIn !== 'open') {
    const opens = eventClock(night.opensAt, night.event.city);
    return (
      <SplitLayout title={`Hi, ${me.name.split(' ')[0]}`} lead={`${night.event.theme}, ${night.event.name}`}>
        <FormCard>
          <p className="text-[17px] font-bold text-ink-900">
            {night.event.cancelled
              ? 'This event was cancelled.'
              : night.checkIn === 'not-yet'
                ? `Check-in opens an hour before the event starts: ${opens.date({ weekday: 'long', day: 'numeric', month: 'long' })}, ${opens.time}${opens.note ? ` (${opens.note})` : ''}.`
                : 'Check-in for this event has closed.'}
          </p>
          {night.checkIn === 'not-yet' && !night.event.cancelled && (
            <p className="text-[15px] leading-normal text-ink-600">
              Come back to this page at the venue, or scan the QR code there, and you&apos;ll be able to check in and see who&apos;s here.
            </p>
          )}
          <ButtonLink href="/events" variant="secondary" block>Upcoming events</ButtonLink>
        </FormCard>
      </SplitLayout>
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
            {/* The list also refreshes on its own every 25 seconds. */}
            <button type="button" onClick={loadRoster} disabled={refreshing} className={`${linkClass} ml-auto text-sm disabled:opacity-50`}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
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
          <p className="mt-3 text-center text-sm text-ink-600">Send your choices before midnight tonight. You can change them and send again until then.</p>
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
          <p className="relative max-w-[460px] text-[17px] leading-normal text-plum-200 text-pretty">Results are worked out after midnight. They&apos;ll be emailed to you and shown on your My Match History page. You can still change your choices until midnight.</p>
          <a href="/matches" className={`relative mt-2 ${buttonClass({ onDark: true })}`}>Go to My Match History</a>
        </div>
      </Container>
    );
  }

  if (step === 'closed') {
    return (
      <SplitLayout title="Choices have closed" lead={night ? `${night.event.theme}, ${night.event.name}` : undefined}>
        <FormCard>
          <p className="text-[17px] font-bold text-ink-900">{closedMessage}</p>
          <p className="text-[15px] leading-normal text-ink-600">Your results are on My Match History, and in your email.</p>
          <ButtonLink href="/matches" block>Go to My Match History</ButtonLink>
        </FormCard>
      </SplitLayout>
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
