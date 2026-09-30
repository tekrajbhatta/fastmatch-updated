'use client';

import { useParams } from 'next/navigation';
import { Container, DecorRing } from '@/components/site/layout';
import { ButtonLink } from '@/components/site/button';

export default function BookedPage() {
  const { eventId } = useParams<{ eventId: string }>();

  return (
    <Container className="py-[clamp(40px,6vw,88px)]">
      {/* The home page's closing panel, as a celebration. */}
      <div className="relative mx-auto flex max-w-[640px] flex-col items-center gap-4 overflow-hidden rounded-[clamp(28px,3.3vw,48px)_clamp(28px,3.3vw,48px)_clamp(28px,3.3vw,48px)_10px] bg-plum-900 px-[clamp(24px,4.4vw,64px)] py-[clamp(40px,5vw,72px)] text-center">
        <DecorRing className="-right-16 -top-20 w-[clamp(160px,20vw,240px)] opacity-60" />
        <span aria-hidden="true" className="relative flex h-16 w-16 items-center justify-center rounded-[32px_32px_32px_8px] bg-match-400 font-display text-3xl font-extrabold text-plum-900">✓</span>
        <h1 className="relative font-display text-[clamp(34px,4vw,52px)] font-extrabold leading-[1.05] tracking-[-0.03em] text-white">You&apos;re booked in!</h1>
        <p className="relative max-w-[460px] text-[17px] leading-normal text-plum-200 text-pretty">
          A confirmation email is on its way. On the night, come back to this page (or your email link) to check in.
        </p>
        <ButtonLink href={`/events/${eventId}/checkin`} onDark className="relative mt-2">
          Preview: check in on the night
        </ButtonLink>
      </div>
    </Container>
  );
}
