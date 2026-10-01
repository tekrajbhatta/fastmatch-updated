'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Loader } from '@/components/ui';

interface Item {
  id: string;
  message: string;
  createdAt: string;
  member: { id: string; name: string; email: string; mobile: string };
  event: { id: string; number: number; name: string; startsAt: string; venue: { name: string } } | null;
}

/** "Member Feedback", as on the old admin: every message members have sent, newest first. */
export default function MemberFeedbackPage() {
  const [data, setData] = useState<{ items: Item[]; page: number; totalPages: number; total: number } | null>(null);

  function load(page: number) {
    fetch(`/api/admin/feedback?page=${page}`).then((r) => r.json()).then(setData);
  }
  useEffect(() => { load(1); }, []);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Member Feedback</h1>
      <p className="mb-6 text-sm text-ink/60">
        Everything members have sent from the Feedback page, newest first. Each one is also emailed to gil@fastmatch.com.au as it arrives.
      </p>

      {!data && <Loader label="Loading feedback…" />}
      {data && data.items.length === 0 && <p className="rounded-xl border border-ink/10 bg-white p-5 text-sm text-ink/50">No feedback yet.</p>}

      <div className="space-y-3">
        {data?.items.map((f) => (
          <div key={f.id} className="rounded-xl border border-ink/10 bg-white p-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-sm">
                <Link href={`/admin/members/${f.member.id}`} className="font-bold text-plum hover:underline">{f.member.name}</Link>
                <span className="text-ink/50"> · <a href={`mailto:${f.member.email}`} className="hover:underline">{f.member.email}</a> · {f.member.mobile}</span>
              </div>
              <div className="text-xs text-ink/50">
                {new Date(f.createdAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </div>
            </div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/50">
              {f.event ? (
                <>
                  About event{' '}
                  <Link href={`/admin/events/${f.event.id}`} className="text-plum hover:underline">
                    #{f.event.number} {f.event.name} at {f.event.venue.name}, {new Date(f.event.startsAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Link>
                </>
              ) : 'General comment'}
            </div>
            {/* Plain text; line breaks kept. */}
            <p className="whitespace-pre-line text-sm text-ink">{f.message}</p>
          </div>
        ))}
      </div>

      {data && data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <Button variant="ghost" disabled={data.page <= 1} onClick={() => load(data.page - 1)}>Previous</Button>
          <span className="text-ink/60">Page {data.page} of {data.totalPages} · {data.total} messages</span>
          <Button variant="ghost" disabled={data.page >= data.totalPages} onClick={() => load(data.page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
