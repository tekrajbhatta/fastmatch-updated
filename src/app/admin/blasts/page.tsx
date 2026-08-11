'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, Badge } from '@/components/ui';

interface Campaign { id: string; title: string; hasBeenSent: boolean; blastStatus: string; sendEmail: boolean; sendSms: boolean; }

export default function BlastsListPage() {
  const [blasts, setBlasts] = useState<Campaign[]>([]);

  useEffect(() => {
    fetch('/api/admin/campaigns').then((r) => r.json()).then(setBlasts);
  }, []);

  const statusTone = (status: string) => (status === 'SENT' ? 'green' : status === 'SENDING' ? 'plum' : 'muted');

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div><h1 className="text-2xl font-extrabold text-ink">Blasts</h1><p className="text-sm text-ink/60">Create a newsletter or SMS blast, filter who it goes to, then send.</p></div>
        <Link href="/admin/blasts/new"><Button>+ Create a new blast</Button></Link>
      </div>

      <div className="space-y-2">
        {blasts.map((b) => (
          <Link key={b.id} href={`/admin/blasts/${b.id}`} className="flex items-center justify-between rounded-lg border border-ink/10 bg-white p-3 hover:border-plum">
            <div>
              <div className="font-bold text-ink">{b.title}</div>
              <div className="text-xs text-ink/50">{b.sendEmail && b.sendSms ? 'Email + SMS' : b.sendEmail ? 'Email' : 'SMS'}</div>
            </div>
            <Badge tone={statusTone(b.blastStatus)}>{b.blastStatus === 'UNUSED' ? 'Unused' : b.blastStatus.charAt(0) + b.blastStatus.slice(1).toLowerCase()}</Badge>
          </Link>
        ))}
        {blasts.length === 0 && <p className="text-sm text-ink/50">No blasts yet.</p>}
      </div>
    </div>
  );
}
