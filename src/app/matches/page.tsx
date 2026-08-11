'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui';

interface Person { id: string; name: string; email: string; mobile: string; }
interface EventMatches {
  event: { id: string; name: string; venue: string; startsAt: string };
  dateMatches: Person[];
  friendMatches: Person[];
}

export default function MatchesPage() {
  const [groups, setGroups] = useState<EventMatches[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/matches').then((r) => r.json()).then((data) => {
      setGroups(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-2xl font-extrabold text-ink">My matches</h1>
      <p className="mb-6 text-sm text-ink/60">Contact details are only shown for people you both matched with.</p>

      {loading && <p className="text-sm text-ink/50">Loading…</p>}
      {!loading && groups.length === 0 && <p className="text-sm text-ink/50">No matches yet — they'll appear here after your next event.</p>}

      {groups.map((g) => (
        <Card key={g.event.id} className="mb-4">
          <h2 className="mb-3 font-extrabold text-ink">{g.event.name}</h2>
          <p className="mb-4 text-xs text-ink/50">{g.event.venue} · {new Date(g.event.startsAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

          {g.dateMatches.length > 0 && (
            <div className="mb-3">
              <h3 className="mb-1.5 text-sm font-extrabold text-green-dark">Date matches</h3>
              {g.dateMatches.map((p) => <PersonRow key={p.id} person={p} />)}
            </div>
          )}
          {g.friendMatches.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-sm font-extrabold text-amber">Friend matches</h3>
              {g.friendMatches.map((p) => <PersonRow key={p.id} person={p} />)}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function PersonRow({ person }: { person: Person }) {
  return (
    <div className="mb-1.5 rounded-lg bg-cream/40 p-2.5">
      <div className="text-sm font-bold text-ink">{person.name}</div>
      <div className="text-xs text-ink/50">{person.email} · {person.mobile}</div>
    </div>
  );
}
