'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, Badge, Button } from '@/components/ui';

interface Booking {
  id: string; badge: number; status: string; paidAmount: string; checkedIn: boolean;
  event: { id: string; name: string; startsAt: string; venue: string };
}
interface MemberDetail {
  id: string; name: string; email: string; mobile: string; gender: string;
  dateOfBirth: string; createdAt: string; agreedTerms: boolean;
  city: { name: string };
  bookings: Booking[];
  matches: { id: string; result: string; memberAId: string; memberBId: string }[];
}

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [member, setMember] = useState<MemberDetail | null>(null);

  useEffect(() => {
    fetch(`/api/admin/members/${id}`).then((r) => r.json()).then(setMember);
  }, [id]);

  if (!member) return <p className="text-sm text-ink/50">Loading…</p>;

  const age = Math.floor((Date.now() - new Date(member.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-extrabold text-ink">{member.name}</h1>
      <p className="mb-6 text-sm text-ink/60">
        {member.email} · {member.mobile} · {member.city?.name} · {age} years old
        {!member.agreedTerms && <span className="ml-2 font-bold text-coral">— T&Cs not yet accepted</span>}
      </p>

      <Card className="mb-6">
        <h2 className="mb-3 font-extrabold text-ink">Events attended ({member.bookings.length})</h2>
        {member.bookings.length === 0 && <p className="text-sm text-ink/40">No bookings yet.</p>}
        <div className="space-y-2">
          {member.bookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-lg bg-cream/40 p-3">
              <div>
                <div className="text-sm font-bold text-ink">{b.event.name}</div>
                <div className="text-xs text-ink/50">
                  {b.event.venue} · {new Date(b.event.startsAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} · Badge #{b.badge}
                </div>
              </div>
              <div className="flex gap-1.5">
                <Badge tone={b.status === 'CONFIRMED' ? 'green' : 'muted'}>{b.status === 'CONFIRMED' ? `Paid $${b.paidAmount}` : b.status}</Badge>
                {b.checkedIn && <Badge tone="plum">Checked in</Badge>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mb-6">
        <h2 className="mb-3 font-extrabold text-ink">Matches ({member.matches.length})</h2>
        {member.matches.length === 0 && <p className="text-sm text-ink/40">No matches yet.</p>}
        <div className="flex flex-wrap gap-2">
          {member.matches.map((m) => (
            <Badge key={m.id} tone={m.result === 'DATE' ? 'green' : 'plum'}>{m.result === 'DATE' ? 'Date match' : 'Friend match'}</Badge>
          ))}
        </div>
      </Card>

      <Button variant="ghost" onClick={() => router.push('/admin/members')} className="w-full">Back to Members</Button>
    </div>
  );
}
