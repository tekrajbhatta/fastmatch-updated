'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Container, DecorRing, BackLink, PageLoader } from '@/components/site/layout';
import { Button, ButtonLink } from '@/components/site/button';

/**
 * Where Stripe sends a member after paying (and where a free booking lands).
 * It used to say "You're booked in!" for any event, paid or not; now it reads
 * the member's booking first:
 *   - paid: "You're booked in!";
 *   - still unpaid: "Confirming your payment…" while Stripe's confirmation
 *     arrives (checking for about 30 seconds), then a clear "not confirmed
 *     yet" — the payment may still come through, so they aren't told to pay
 *     again;
 *   - refunded instead of booked (the event filled up after their 10-minute
 *     hold ran out, or was cancelled, as they paid): says so, and that their
 *     money is going back;
 *   - no booking (or a cancelled one): back to the event page.
 */
const CHECK_EVERY_MS = 2000;
const GIVE_UP_AFTER_MS = 30_000;

type State = 'loading' | 'confirmed' | 'waiting' | 'not-confirmed' | 'refunded';
interface Refunded { reason: 'full' | 'cancelled'; refunded: boolean }

export default function BookedPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const [state, setState] = useState<State>('loading');
  const [round, setRound] = useState(0); // "Check again" starts a new round
  const [refunded, setRefunded] = useState<Refunded | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    async function check() {
      // The payment page they've come back from, to tell if it was refunded.
      const session = new URLSearchParams(window.location.search).get('session_id');
      const r = await fetch(`/api/events/${eventId}/my-booking${session ? `?session=${encodeURIComponent(session)}` : ''}`).catch(() => null);
      const data = r?.ok ? await r.json().catch(() => null) : null;
      if (stopped) return;
      const status: string = data?.status ?? 'UNKNOWN';
      if (status === 'CONFIRMED') return setState('confirmed');
      if (data?.refundedPayment) { setRefunded(data.refundedPayment); return setState('refunded'); }
      if (status === 'NONE' || status === 'CANCELLED' || status === 'REFUNDED') return router.replace(`/events/${eventId}`);
      if (Date.now() - started >= GIVE_UP_AFTER_MS) return setState('not-confirmed');
      setState('waiting');
      timer = setTimeout(check, CHECK_EVERY_MS);
    }
    check();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [eventId, router, round]);

  if (state === 'loading') return <Container><PageLoader>Checking your booking…</PageLoader></Container>;

  return (
    <Container className="py-[clamp(40px,6vw,88px)]">
      <div className="mx-auto max-w-[640px]">
        <BackLink href={`/events/${eventId}`} label="Back to event" className="mb-3" />
      </div>
      {/* The home page's closing panel, as a celebration. */}
      <div className="relative mx-auto flex max-w-[640px] flex-col items-center gap-4 overflow-hidden rounded-[clamp(28px,3.3vw,48px)_clamp(28px,3.3vw,48px)_clamp(28px,3.3vw,48px)_10px] bg-plum-900 px-[clamp(24px,4.4vw,64px)] py-[clamp(40px,5vw,72px)] text-center">
        <DecorRing className="-right-16 -top-20 w-[clamp(160px,20vw,240px)] opacity-60" />
        {state === 'confirmed' && (
          <>
            <span aria-hidden="true" className="relative flex h-16 w-16 items-center justify-center rounded-[32px_32px_32px_8px] bg-match-400 font-display text-3xl font-extrabold text-plum-900">✓</span>
            <h1 className="relative font-display text-[clamp(34px,4vw,52px)] font-extrabold leading-[1.05] tracking-[-0.03em] text-white">You&apos;re booked in!</h1>
            <p className="relative max-w-[460px] text-[17px] leading-normal text-plum-200 text-pretty">
              A confirmation email is on its way. On the night, check in from an hour before the start: open the
              check-in link in that email, or scan the QR code at the venue.
            </p>
          </>
        )}
        {state === 'waiting' && (
          <div role="status" className="relative flex flex-col items-center gap-4">
            <span aria-hidden="true" className="h-12 w-12 animate-spin rounded-full border-4 border-plum-200/30 border-t-match-400" />
            <h1 className="font-display text-[clamp(28px,3.4vw,44px)] font-extrabold leading-[1.1] tracking-[-0.03em] text-white">Confirming your payment…</h1>
            <p className="max-w-[460px] text-[17px] leading-normal text-plum-200 text-pretty">This usually takes a few seconds. Please keep this page open.</p>
          </div>
        )}
        {state === 'refunded' && refunded && (
          <div role="status" className="relative flex flex-col items-center gap-4">
            <h1 className="font-display text-[clamp(28px,3.4vw,44px)] font-extrabold leading-[1.1] tracking-[-0.03em] text-white">
              {refunded.reason === 'full' ? 'Sorry, this event filled up' : 'This event has been cancelled'}
            </h1>
            <p className="max-w-[460px] text-[17px] leading-normal text-plum-200 text-pretty">
              {refunded.reason === 'full'
                ? 'Someone else took the last place while you were paying, so you haven’t been booked in.'
                : 'It was cancelled as you were paying, so you haven’t been booked in.'}{' '}
              {refunded.refunded
                ? 'Your payment has been refunded to your card: depending on your bank, it can take 5 to 10 business days to show.'
                : 'Your payment will be refunded to your card in full.'}{' '}
              We&apos;ve emailed you the details.
            </p>
            <ButtonLink href="/events" onDark className="mt-2">See upcoming events</ButtonLink>
          </div>
        )}
        {state === 'not-confirmed' && (
          <div role="status" className="relative flex flex-col items-center gap-4">
            <h1 className="font-display text-[clamp(28px,3.4vw,44px)] font-extrabold leading-[1.1] tracking-[-0.03em] text-white">Your payment isn&apos;t confirmed yet</h1>
            <p className="max-w-[460px] text-[17px] leading-normal text-plum-200 text-pretty">
              If you completed the payment, please don&apos;t pay again: we&apos;ll email your confirmation as soon as it comes
              through. If you didn&apos;t finish paying, you can book again from the event page. Questions? Email gil@fastmatch.com.au.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <Button onClick={() => { setState('waiting'); setRound((n) => n + 1); }} onDark>Check again</Button>
              <ButtonLink href={`/events/${eventId}`} onDark>Back to event</ButtonLink>
            </div>
          </div>
        )}
      </div>
    </Container>
  );
}
