'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui';

// PLACEHOLDER — the event detail screen links here, but the edit form isn't
// built yet. The backend is ready (PATCH /api/admin/events/:id updates any
// field and automatically emails+SMSes every confirmed booking if the start
// time changes; DELETE removes-or-cancels). Replace this page with the real
// form — mirror the create form in ../new/page.tsx.

export default function AdminEventEditPage() {
  const { eventId } = useParams<{ eventId: string }>();
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Edit event</h1>
      <p className="mb-6 text-sm text-ink/60">Not built yet.</p>
      <Card>
        <p className="text-sm text-ink/60">
          The editing screen is on the build plan (the underlying update API already works,
          including notifying booked attendees of date changes). Until it exists, event
          changes need to be made directly by the developer.
        </p>
        <Link href={`/admin/events/${eventId}`} className="mt-4 block text-sm font-bold text-plum">
          ← Back to event
        </Link>
      </Card>
    </div>
  );
}
