'use client';

import { useState, useEffect } from 'react';
import MemberEventsBrowser from '@/components/MemberEventsBrowser';
import { Card, Container, LoadingNote, PageHero } from '@/components/site/layout';
import { ButtonLink } from '@/components/site/button';
import { formatEventForViewer } from '@/lib/timezone';

interface Person { id: string; name: string; email: string; mobile: string; badge: number | null }
interface HistoryItem {
  event: { id: string; name: string; startsAt: string; venue: { name: string; address: string | null }; city: { name: string } };
  matchesCalculated: boolean;
  dateMatches: Person[];
  friendMatches: Person[];
}
interface MatchHistory { months: number; history: HistoryItem[]; welcomeOffer: { code: string; description: string } | null }

// Page body under the plum title band.
const BODY = 'pb-[clamp(56px,6.7vw,96px)] pt-[clamp(24px,3.9vw,56px)]';

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
      <>
        <PageHero title="My Match History" />
        <section className={BODY}>
          <Container>
            <Card className="mx-auto max-w-sm text-center">
              <p className="mb-5 text-base leading-relaxed text-ink-600">Your session has expired. Please log in again.</p>
              <ButtonLink href="/login?next=%2Fmatches" block>Log in</ButtonLink>
            </Card>
          </Container>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHero title="My Match History" />
      <section className={BODY}>
        <Container>
          {!data && <LoadingNote>Loading…</LoadingNote>}

          {data && data.history.length > 0 && (
            <>
              <div className="max-w-[760px]">
                <p className="text-base leading-relaxed text-ink-600 md:text-lg">
                  Fast Match keeps a record of your matches for the last {data.months} months, so no need for a super memory,
                  saved emails, or lots of little pieces of paper in your wallet, handbag or desk drawer.
                </p>
                <p className="mt-4 text-base font-bold leading-relaxed text-ink-900 md:text-lg">Here are your matches for the past {data.months} months:</p>
              </div>
              <div className="mb-[clamp(48px,5.5vw,80px)] mt-6 flex flex-col gap-4">
                {data.history.map((h) => (
                  <Card key={h.event.id}>
                    <h2 className="font-display text-[clamp(22px,2vw,28px)] font-extrabold leading-[1.15] tracking-[-0.02em] text-ink-900">
                      {h.event.venue.name} — {formatEventForViewer(h.event.startsAt, h.event.city.name).dateWithYear}
                    </h2>
                    <p className="mt-1.5 text-sm text-ink-600">{h.event.name} · {h.event.city.name}</p>
                    <div className="mt-5 grid gap-6 border-t border-dashed border-[#DCD0C2] pt-5 md:grid-cols-2 md:gap-8">
                      <MatchList title="Date Matches" tone="bg-plum-100 text-plum-700" calculated={h.matchesCalculated} people={h.dateMatches} />
                      <MatchList title="Friend Matches" tone="bg-coral-600/10 text-coral-700" calculated={h.matchesCalculated} people={h.friendMatches} />
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}

          {data && data.history.length === 0 && (
            <Card className="mb-[clamp(48px,5.5vw,80px)] max-w-[760px] space-y-3 text-base leading-relaxed text-ink-600">
              <p className="font-bold text-ink-900">You have not attended any events recently.</p>
              {data.welcomeOffer && (
                <p>
                  We&apos;d love you to attend one of our Fast Match events&hellip; and as a special offer, we&apos;ll give you{' '}
                  <strong className="font-bold text-ink-900">{data.welcomeOffer.description}</strong> your first event. Simply enter{' '}
                  <strong className="whitespace-nowrap rounded-md bg-match-400 px-1.5 py-0.5 font-extrabold text-plum-900">{data.welcomeOffer.code}</strong> in the discount code box when you book.
                </p>
              )}
              <p>Hope to see you at a Fast Match soon!</p>
            </Card>
          )}

          {data && <MemberEventsBrowser showBookedList={false} />}
        </Container>
      </section>
    </>
  );
}

const CONTACT_LINK =
  'rounded-sm font-semibold text-plum-700 underline underline-offset-[3px] hover:text-plum-900 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-plum-700';

function MatchList({ title, tone, calculated, people }: { title: string; tone: string; calculated: boolean; people: Person[] }) {
  return (
    <div className="min-w-0">
      <h3 className={`inline-block rounded-[999px_999px_999px_4px] px-3 py-[5px] text-[13px] font-extrabold leading-[1.3] ${tone}`}>{title}</h3>
      {!calculated ? (
        <p className="mt-3 text-[15px] text-ink-600">Information not available yet</p>
      ) : people.length === 0 ? (
        <p className="mt-3 text-[15px] text-ink-600">No {title.toLowerCase()} from this event.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2 text-[15px] leading-normal text-ink-900">
          {people.map((p) => (
            <li key={p.id} className="break-words">
              <strong>{p.name}</strong> (
              {p.badge != null && <>badge: {p.badge}, </>}
              <a href={`tel:${p.mobile.replace(/\s/g, '')}`} className={CONTACT_LINK}>{p.mobile}</a>,{' '}
              <a href={`mailto:${p.email}`} className={CONTACT_LINK}>{p.email}</a>)
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
