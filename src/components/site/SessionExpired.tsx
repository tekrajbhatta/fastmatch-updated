'use client';

import { ButtonLink } from '@/components/site/button';

/**
 * In place of a form whose answer was "not logged in": the session ended (a
 * password changed on another device, say) while the page was open. It used
 * to show a bare "Not authenticated", or a form with every field empty.
 * `next` brings them back here once they're in.
 */
export default function SessionExpired({ next }: { next: string }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-base leading-relaxed text-ink-600">Your session has expired. Please log in again.</p>
      <ButtonLink href={`/login?next=${encodeURIComponent(next)}`} block>Log in</ButtonLink>
    </div>
  );
}
