'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, Button } from '@/components/ui';
import MemberEventsBrowser from '@/components/MemberEventsBrowser';
import { formatEventForViewer } from '@/lib/timezone';

interface Person { id: string; name: string; email: string; mobile: string; badge: number | null }
interface HistoryItem {
  event: { id: string; name: string; startsAt: string; venue: { name: string; address: string | null }; city: { name: string } };
  matchesCalculated: boolean;
  dateMatches: Person[];
  friendMatches: Person[];
}
interface MatchHistory { months: number; history: HistoryItem[]; welcomeOffer: { code: string; description: string } | null }

/**
 * My Match History, laid out as on the old site: the last six months of
 * events with each one's Date and Friend matches, then the events table
 * (booked first, then what's coming up) to view and book from.
 */
export default function MatchHistoryPage() {
  const [data, setData] = useState<MatchHistory | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    fetch('/api/matches').then(async (r) => {
      if (r.status === 401) { setNeedsLogin(true); return; }
      setData(await r.json());
    });
  }, []);

  // Middleware keeps logged-out visitors off this page, so a 401 here means a
  // session that expired or was rejected. ?next= returns them once they're in.
  if (needsLogin) {
    return (
      <div className="mx-auto max-w-sm text-center">
        <Card>
          <p className="mb-4 text-sm text-ink/60">Your session has expired. Please log in again.</p>
          <Link href="/login?next=%2Fmatches"><Button className="w-full">Log in</Button></Link>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-extrabold text-ink">My Match History</h1>

      {!data && <p className="text-sm text-ink/50">Loading…</p>}

      {data && data.history.length > 0 && (
        <>
          <p className="mb-3 text-sm text-ink/70">
            Fast Match keeps a record of your matches for the last {data.months} months, so no need for a super memory,
            saved emails, or lots of little pieces of paper in your wallet, handbag or desk drawer.
          </p>
          <p className="mb-4 text-sm font-bold text-ink">Here are your matches for the past {data.months} months:</p>
          <div className="mb-10 space-y-4">
            {data.history.map((h) => (
              <Card key={h.event.id}>
                <h2 className="text-lg font-extrabold text-ink">
                  {h.event.venue.name} — {formatEventForViewer(h.event.startsAt, h.event.city.name).dateWithYear}
                </h2>
                <p className="mb-3 text-xs text-ink/50">{h.event.name} · {h.event.city.name}</p>
                <MatchList title="Date Matches" tone="text-green-dark" calculated={h.matchesCalculated} people={h.dateMatches} />
                <MatchList title="Friend Matches" tone="text-amber" calculated={h.matchesCalculated} people={h.friendMatches} />
              </Card>
            ))}
          </div>
        </>
      )}

      {data && data.history.length === 0 && (
        <div className="mb-10 space-y-3 text-sm text-ink/70">
          <p className="font-bold text-ink">You have not attended any events recently.</p>
          {data.welcomeOffer && (
            <p>
              We&apos;d love you to attend one of our Fast Match events&hellip; and as a special offer, we&apos;ll give you{' '}
              <strong className="text-ink">{data.welcomeOffer.description}</strong> your first event. Simply enter{' '}
              <strong className="text-ink">{data.welcomeOffer.code}</strong> in the discount code box when you book.
            </p>
          )}
          <p>Hope to see you at a Fast Match soon!</p>
        </div>
      )}

      {data && <MemberEventsBrowser showBookedList={false} />}
    </div>
  );
}

function MatchList({ title, tone, calculated, people }: { title: string; tone: string; calculated: boolean; people: Person[] }) {
  return (
    <div className="mb-3 last:mb-0">
      <h3 className={`text-sm font-extrabold ${tone}`}>{title}</h3>
      {!calculated ? (
        <p className="text-sm text-ink/50">Information not available yet</p>
      ) : people.length === 0 ? (
        <p className="text-sm text-ink/50">No {title.toLowerCase()} from this event.</p>
      ) : (
        <ul className="mt-1 list-inside list-disc text-sm text-ink">
          {people.map((p) => (
            <li key={p.id}>
              <strong>{p.name}</strong> (
              {p.badge != null && <>badge: {p.badge}, </>}
              <a href={`tel:${p.mobile.replace(/\s/g, '')}`} className="text-plum hover:underline">{p.mobile}</a>,{' '}
              <a href={`mailto:${p.email}`} className="text-plum hover:underline">{p.email}</a>)
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
