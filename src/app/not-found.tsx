import type { Metadata } from 'next';
import Link from 'next/link';
import { FormCard } from '@/components/site/layout';
import { ButtonLink, linkClass } from '@/components/site/button';

export const metadata: Metadata = { title: 'Page not found' };

// Any address the site doesn't have. It used to be Next's plain default page,
// with no header, no footer and no way back.
export default function NotFound() {
  return (
    <div className="flex flex-1 items-start justify-center px-4 py-[clamp(40px,7.2vw,104px)]">
      <FormCard className="text-center">
        <p className="font-display text-[56px] font-extrabold leading-none tracking-[-0.02em] text-plum-700">404</p>
        <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-ink-900">We couldn&apos;t find that page</h1>
        <p className="text-base leading-relaxed text-ink-600">The link may be old, or the page may have moved.</p>
        <ButtonLink href="/events" block>See upcoming events</ButtonLink>
        <Link href="/" className={`${linkClass} self-center text-[15px]`}>Go to the home page</Link>
      </FormCard>
    </div>
  );
}
