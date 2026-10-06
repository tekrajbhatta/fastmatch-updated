'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, Input, Loader, BackLink } from '@/components/ui';
import { timeZoneForCity } from '@/lib/timezone';
import { CHOICE_KINDS, type ChoiceKind, type MatchesView, type PersonRow, type ViewPerson } from '@/lib/matchesView';

interface Data extends MatchesView {
  event: {
    id: string; number: number; name: string; theme: string; startsAt: string; city: string;
    matchesCalculated: boolean; matchesCalculatedAt: string | null; ratingAudience: 'OPPOSITE_GENDER' | 'EVERYONE';
  };
  checkedIn: number;
  sentChoices: number;
}

const LABEL: Record<ChoiceKind, string> = { DATE: 'Date', FRIEND: 'Friend', NO: 'No' };
const TONE: Record<ChoiceKind, string> = { DATE: 'text-green-dark', FRIEND: 'text-amber', NO: 'text-ink/50' };
const who = (p: ViewPerson) => `${String(p.badge).padStart(2, '0')} ${p.name}`;

/**
 * "Matches and choices" (Gil, 4 Oct): who matched with whom, and everyone's
 * Date / Friend / No choices, both ways — for checking a member's question
 * about their results. Private: only admins can open it.
 */
export default function EventMatchesPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`/api/admin/events/${eventId}/matches`)
      .then(async (r) => { if (!r.ok) throw new Error(); setData(await r.json()); })
      .catch(() => setError('The matches could not be loaded.'));
  }, [eventId]);

  if (error) return <p className="text-sm font-medium text-coral">{error}</p>;
  if (!data) return <Loader label="Loading matches and choices…" />;

  const tz = timeZoneForCity(data.event.city);
  const when = new Date(data.event.startsAt).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: tz });
  const words = search.trim().toLowerCase();
  const rows = words ? data.rows.filter((r) => `${String(r.badge).padStart(2, '0')} ${r.name}`.toLowerCase().includes(words)) : data.rows;

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink href={`/admin/events/${eventId}`}>Back to event</BackLink>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Matches and choices</h1>
      <p className="text-sm text-ink/60">#{data.event.number} {data.event.theme} · {data.event.name} · {when}, {data.event.city}</p>
      <p className="mb-6 mt-1 text-xs text-ink/50">
        Private: for checking a member&apos;s question about their results. Members only ever see their own matches.
        {data.event.ratingAudience === 'OPPOSITE_GENDER' ? ' Members rated the opposite gender only.' : ' Members could rate everyone.'}
      </p>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Checked in" value={data.checkedIn} />
        <Stat label="Sent their choices" value={data.sentChoices} />
        <Stat
          label="Results"
          value={data.event.matchesCalculated
            ? `Worked out ${data.event.matchesCalculatedAt ? new Date(data.event.matchesCalculatedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: tz }) : ''}`
            : 'Not worked out yet'}
        />
      </div>

      <Card className="mb-6">
        <h2 className="mb-2 font-extrabold text-ink">Matches</h2>
        {!data.event.matchesCalculated ? (
          <p className="text-sm text-ink/60">Results are worked out after midnight (the event city&apos;s time), or with “Work out results now” on the event page. The choices so far are below.</p>
        ) : data.pairs.DATE.length + data.pairs.FRIEND.length === 0 ? (
          <p className="text-sm text-ink/60">No mutual matches at this event.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {(['DATE', 'FRIEND'] as const).map((k) => (
              <div key={k}>
                <div className={`mb-1 text-sm font-bold ${TONE[k]}`}>{LABEL[k]} matches ({data.pairs[k].length})</div>
                {data.pairs[k].length === 0 ? <p className="text-sm text-ink/40">None</p> : (
                  <ul className="space-y-0.5 text-sm text-ink">
                    {data.pairs[k].map(([a, b]) => <li key={`${a.id}-${b.id}`}>{who(a)} &amp; {who(b)}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-extrabold text-ink">Everyone&apos;s choices</h2>
          <div className="w-full sm:w-72">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a member (name or number)" />
          </div>
        </div>
        {data.rows.length === 0 ? (
          <p className="text-sm text-ink/60">Nobody has checked in yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-ink/10">
            <table className="w-full text-sm">
              <thead className="bg-cream/60 text-left text-xs font-bold uppercase text-ink/50">
                <tr>
                  <th className="px-3 py-2.5">#</th>
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5">Chose</th>
                  <th className="px-3 py-2.5">Was chosen by</th>
                  <th className="px-3 py-2.5">Matches</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => <PersonRowView key={r.id} r={r} calculated={data.event.matchesCalculated} />)}
                {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-3 text-ink/40">Nobody matches “{search}”.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function PersonRowView({ r, calculated }: { r: PersonRow; calculated: boolean }) {
  return (
    <tr className="border-t border-ink/5 align-top">
      <td className="px-3 py-2.5 font-bold text-ink/50">{String(r.badge).padStart(2, '0')}</td>
      <td className="px-3 py-2.5 font-bold text-ink">{r.name}<span className="block text-xs font-normal text-ink/40">{r.gender === 'MALE' ? 'M' : 'F'}</span></td>
      <td className="px-3 py-2.5"><Choices groups={r.chose} empty="No choices sent" /></td>
      <td className="px-3 py-2.5"><Choices groups={r.chosenBy} empty="Nobody chose them" /></td>
      <td className="px-3 py-2.5">
        {!calculated ? <span className="text-ink/40">Not worked out yet</span>
          : r.matches.DATE.length + r.matches.FRIEND.length === 0 ? <span className="text-ink/40">No matches</span>
          : (['DATE', 'FRIEND'] as const).filter((k) => r.matches[k].length).map((k) => (
            <div key={k}><span className={`font-bold ${TONE[k]}`}>{LABEL[k]}:</span> {r.matches[k].map(who).join(', ')}</div>
          ))}
      </td>
    </tr>
  );
}

function Choices({ groups, empty }: { groups: Record<ChoiceKind, ViewPerson[]>; empty: string }) {
  const kinds = CHOICE_KINDS.filter((k) => groups[k].length);
  if (!kinds.length) return <span className="text-ink/40">{empty}</span>;
  return (
    <>
      {kinds.map((k) => (
        <div key={k}><span className={`font-bold ${TONE[k]}`}>{LABEL[k]}:</span> {groups[k].map(who).join(', ')}</div>
      ))}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <div className="text-lg font-extrabold text-plum">{value}</div>
      <div className="text-xs font-bold uppercase text-ink/50">{label}</div>
    </Card>
  );
}
