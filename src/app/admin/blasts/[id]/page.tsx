'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Field, Input, Select, Button, Card, Badge } from '@/components/ui';

interface Campaign {
  id: string; title: string; hasBeenSent: boolean; subject: string; sendEmail: boolean; sendSms: boolean;
  fromName: string; fromEmail: string; reusable: boolean;
}
interface Send { id: string; status: string; sentCount: number; totalRecipients: number; startedAt: string; }

export default function ViewBlastPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<'details' | 'send' | 'history'>((search.get('tab') as any) ?? 'details');
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [sends, setSends] = useState<Send[]>([]);
  const [testTo, setTestTo] = useState('');
  const [filter, setFilter] = useState({ ageMin: '', ageMax: '', gender: '' });
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [activeSend, setActiveSend] = useState<Send | null>(null);

  function loadCampaign() {
    fetch(`/api/admin/campaigns/${id}`).then((r) => r.json()).then(setCampaign);
  }
  function loadHistory() {
    fetch(`/api/admin/campaigns/${id}/sends`).then((r) => r.json()).then(setSends);
  }

  useEffect(() => { loadCampaign(); loadHistory(); }, [id]);

  async function handlePreview() {
    const res = await fetch(`/api/admin/campaigns/${id}/preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: { ageMin: filter.ageMin ? Number(filter.ageMin) : undefined, ageMax: filter.ageMax ? Number(filter.ageMax) : undefined, gender: filter.gender || undefined } }),
    });
    const data = await res.json();
    setPreviewCount(data.count);
  }

  async function handleTestSend() {
    await fetch(`/api/admin/campaigns/${id}/test-send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testTo }),
    });
    alert(`Test sent to ${testTo}.`);
  }

  async function handleSendNow() {
    await fetch(`/api/admin/campaigns/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filter }),
    });
    const res = await fetch(`/api/admin/campaigns/${id}/send`, { method: 'POST' });
    const data = await res.json();
    // Poll for progress
    pollSend(data.id ?? null);
  }

  async function pollSend(sendId: string | null) {
    loadHistory();
    const latest = await fetch(`/api/admin/campaigns/${id}/sends`).then((r) => r.json());
    const current = latest[0];
    setActiveSend(current);
    if (current && current.status === 'SENDING') {
      setTimeout(() => pollSend(current.id), 2000);
    }
  }

  async function handleDuplicate() {
    const res = await fetch(`/api/admin/campaigns/${id}/duplicate`, { method: 'POST' });
    const data = await res.json();
    router.push(`/admin/blasts/${data.id}`);
  }

  async function handleStopReusing() {
    await fetch(`/api/admin/campaigns/${id}/stop-reusing`, { method: 'POST' });
    loadCampaign();
  }

  if (!campaign) return <p className="text-sm text-ink/50">Loading…</p>;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-2 text-2xl font-extrabold text-ink">{campaign.title}</h1>

      <div className="mb-4 flex gap-3 text-sm">
        {campaign.hasBeenSent ? (
          <button onClick={handleDuplicate} className="font-bold text-plum underline">Duplicate Blast</button>
        ) : (
          <button onClick={() => router.push(`/admin/blasts/${id}/edit`)} className="font-bold text-plum underline">Edit Blast</button>
        )}
        <button onClick={handleStopReusing} className="font-bold text-plum underline">Stop re-using blast</button>
      </div>

      <div className="mb-4 flex gap-2">
        {(['details', 'send', 'history'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-full px-3 py-1.5 text-sm font-bold ${tab === t ? 'bg-plum text-white' : 'bg-plum/10 text-plum'}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <Card>
          <div className="mb-4 flex items-end gap-2">
            <div className="flex-1"><Field label="Send test to"><Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@email.com" /></Field></div>
            <Button onClick={handleTestSend}>Send Test</Button>
          </div>
          <Row label="Send Email?" value={campaign.sendEmail ? 'Yes' : 'No'} />
          <Row label="Email from" value={`${campaign.fromName} <${campaign.fromEmail}>`} />
          <Row label="Subject" value={campaign.subject} />
          <Row label="Send SMS?" value={campaign.sendSms ? 'Yes' : 'No'} />
        </Card>
      )}

      {tab === 'send' && (
        <Card>
          <div className="mb-2 text-sm font-extrabold text-ink">Select members</div>
          <p className="mb-4 text-sm text-ink/60">"Email and SMS" and "SMS" are different — select both if you want to reach everyone who can receive SMS.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Age from"><Input type="number" value={filter.ageMin} onChange={(e) => setFilter({ ...filter, ageMin: e.target.value })} /></Field>
            <Field label="Age to"><Input type="number" value={filter.ageMax} onChange={(e) => setFilter({ ...filter, ageMax: e.target.value })} /></Field>
          </div>
          <Field label="Gender">
            <Select value={filter.gender} onChange={(e) => setFilter({ ...filter, gender: e.target.value })}>
              <option value="">Any</option><option value="MALE">Male</option><option value="FEMALE">Female</option>
            </Select>
          </Field>
          <Button variant="ghost" onClick={handlePreview} className="mb-4 w-full">Filter</Button>
          {previewCount !== null && (
            <div className="mb-4 rounded-lg bg-plum/10 p-3 text-center font-extrabold text-plum">{previewCount.toLocaleString()} members filtered</div>
          )}
          {activeSend && activeSend.status === 'SENDING' && (
            <div className="mb-4 rounded-lg bg-cream/50 p-3 text-center text-sm">
              <div className="text-xl font-extrabold text-plum">{activeSend.sentCount} / {activeSend.totalRecipients}</div>
              <div className="text-ink/50">sending…</div>
            </div>
          )}
          <Button onClick={handleSendNow} className="w-full">Send Blast Now</Button>
        </Card>
      )}

      {tab === 'history' && (
        <div className="space-y-2">
          {sends.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-ink/10 bg-white p-3">
              <div>
                <div className="text-sm font-bold text-ink">{new Date(s.startedAt).toLocaleString('en-AU')}</div>
                <div className="text-xs text-ink/50">{s.sentCount} / {s.totalRecipients} sent</div>
              </div>
              <Badge tone={s.status === 'SENT' ? 'green' : 'muted'}>{s.status}</Badge>
            </div>
          ))}
          {sends.length === 0 && <p className="text-sm text-ink/50">No sends yet.</p>}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-ink/5 py-2.5 text-sm last:border-0">
      <span className="text-ink/50">{label}</span><span className="font-bold text-ink">{value}</span>
    </div>
  );
}
