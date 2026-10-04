'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Badge, Loader } from '@/components/ui';
import { Spinner } from '@/components/Spinner';

interface Campaign { id: string; title: string; hasBeenSent: boolean; blastStatus: string; sendEmail: boolean; sendSms: boolean; reusable: boolean; }

export default function BlastsListPage() {
  const router = useRouter();
  const [blasts, setBlasts] = useState<Campaign[]>([]);
  // False until the first fetch returns, so the list doesn't claim to be empty while loading.
  const [loaded, setLoaded] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/campaigns').then((r) => r.json()).then((d) => { setBlasts(d); setLoaded(true); });
  }, []);

  const statusTone = (status: string) => (status === 'SENT' ? 'green' : status === 'SENDING' ? 'plum' : 'muted');

  // Copies every field, then opens the copy for editing — as Duplicate event does.
  async function duplicate(id: string) {
    setDuplicating(id);
    setError(null);
    const res = await fetch(`/api/admin/campaigns/${id}/duplicate`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setDuplicating(null);
    if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Could not duplicate that blast.'); return; }
    router.push(`/admin/blasts/${data.id}/edit`);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div><h1 className="text-2xl font-extrabold text-ink">Blasts</h1><p className="text-sm text-ink/60">Create a newsletter or SMS blast, filter who it goes to, then send.</p></div>
        <Link href="/admin/blasts/new"><Button>+ Create a new blast</Button></Link>
      </div>

      {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}

      <div className="space-y-2">
        {blasts.map((b) => (
          <div key={b.id} className="flex items-center gap-3 rounded-lg border border-ink/10 bg-white p-3 hover:border-plum">
            {/* The row still opens the blast; the buttons at the end are shortcuts. */}
            <Link href={`/admin/blasts/${b.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-bold text-ink">{b.title}</div>
                <div className="text-xs text-ink/50">{b.sendEmail && b.sendSms ? 'Email + SMS' : b.sendEmail ? 'Email' : 'SMS'}</div>
              </div>
              <span className="flex shrink-0 gap-1.5">
                {/* "Stop re-using blast" used to leave no trace on the list. */}
                {!b.reusable && <Badge tone="muted">Retired</Badge>}
                <Badge tone={statusTone(b.blastStatus)}>{b.blastStatus === 'UNUSED' ? 'Unused' : b.blastStatus.charAt(0) + b.blastStatus.slice(1).toLowerCase()}</Badge>
              </span>
            </Link>
            <div className="flex shrink-0 gap-2">
              <Link href={`/admin/blasts/${b.id}/edit`} className="rounded-lg border border-plum px-3 py-1.5 text-xs font-bold text-plum hover:bg-plum hover:text-white">
                Edit
              </Link>
              <button
                onClick={() => duplicate(b.id)}
                disabled={duplicating !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-plum px-3 py-1.5 text-xs font-bold text-plum hover:bg-plum hover:text-white disabled:opacity-50"
              >
                {duplicating === b.id && <Spinner className="h-3.5 w-3.5" />}
                {duplicating === b.id ? 'Duplicating…' : 'Duplicate'}
              </button>
              {/* Same destination as clicking the row (preview, send,
                  history) — a visible target, as on the events list. */}
              <Link href={`/admin/blasts/${b.id}`} className="rounded-lg border border-plum px-3 py-1.5 text-xs font-bold text-plum hover:bg-plum hover:text-white">
                Manage
              </Link>
            </div>
          </div>
        ))}
        {!loaded ? <Loader label="Loading blasts…" /> : blasts.length === 0 && <p className="text-sm text-ink/50">No blasts yet.</p>}
      </div>
    </div>
  );
}
