'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui';

export default function BookedPage() {
  const { eventId } = useParams<{ eventId: string }>();

  return (
    <div className="mx-auto max-w-sm text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green/15 text-3xl text-green-dark">✓</div>
      <h1 className="mb-2 text-2xl font-extrabold text-ink">You're booked in!</h1>
      <p className="mb-6 text-sm text-ink/60">
        A confirmation email is on its way. On the night, come back to this page (or your email link) to check in.
      </p>
      <Link href={`/events/${eventId}/checkin`}>
        <Button className="w-full">Preview: check in on the night</Button>
      </Link>
    </div>
  );
}
