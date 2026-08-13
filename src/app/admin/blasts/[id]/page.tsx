'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Field, Input, Select, Button, Card, Badge } from '@/components/ui';

interface Campaign {
  id: string; title: string; hasBeenSent: boolean; subject: string; sendEmail: boolean; sendSms: boolean;
  fromName: string; fromEmail: string; reusable: boolean;
}
interface Send { id: string; status: string; sentCount: number; totalRecipients: number; startedAt: string; }
interface City { id: string; name: string; }

export default function ViewBlastPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<'details' | 'send' | 'history'>((search.get('tab') as any) ?? 'details');
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [sends, setSends] = useState<Send[]>([]);
  const [testTo, setTestTo] = useState('');
  const [cities, setCities] = useState<City[]>([]);
  const [filter, setFilter] = useState({ ageMin: '', ageMax: '', gender: '', cityId: '', contactMethod: '' });
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [activeSend, setActiveSend] = useState<Send | null>(null);
  const [smsCredits, setSmsCredits] = useState<number | null>(null);

  function loadCampaign() {
    fetch(`/api/admin/campaigns/${id}`).then((r) => r.json()).then(setCampaign);
  }
  function loadHistory() {
    fetch(`/api/admin/campaigns/${id}/sends`).then((r) => r.json()).then((data) => {
      setSends(data);
      const inProgress = data.find((s: Send) => s.status === 'SENDING' || s.status === 'PAUSED');
      setActiveSend(inProgress ?? null);
    });
  }

  useEffect(() => {
    loadCampaign(); loadHistory();
    fetch('/api/cities').then((r) => r.json()).then(setCities);
    fetch('/api/admin/sms-credits').then((r) => r.json()).then((d) => setSmsCredits(d.credits));
  }, [id]);

  async function handlePreview() {
    const res = await fetch(`/api/admin/campaigns/${id}/preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          ageMin: filter.ageMin ? Number(filter.ageMin) : undefined,
          ageMax: filter.ageMax ? Number(filter.ageMax) : undefined,
          gender: filter.gender || undefined,
          cityId: filter.cityId || undefined,
          contactMethods: filter.contactMethod ? [filter.contactMethod] : undefined,
        },
      }),
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
    const savedFilter = {
      ageMin: filter.ageMin ? Number(filter.ageMin) : undefined,
      ageMax: filter.ageMax ? Number(filter.ageMax) : undefined,
      gender: filter.gender || undefined,
      cityId: filter.cityId || undefined,
      contactMethods: filter.contactMethod ? [filter.contactMethod] : undefined,
    };
    await fetch(`/api/admin/campaigns/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: savedFilter }),
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

  async function handlePause() {
    if (!activeSend) return;
    await fetch(`/api/admin/campaigns/${id}/sends/${activeSend.id}/pause`, { method: 'POST' });
    loadHistory();
  }
  async function handleResume() {
    if (!activeSend) return;
    await fetch(`/api/admin/campaigns/${id}/sends/${activeSend.id}/resume`, { method: 'POST' });
    pollSend(activeSend.id);
  }
  async function handleCancel() {
    if (!activeSend) return;
    if (!confirm('Cancel this send? It cannot be resumed once cancelled.')) return;
    await fetch(`/api/admin/campaigns/${id}/sends/${activeSend.id}/cancel`, { method: 'POST' });
    loadHistory();
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

      {smsCredits !== null && (
        <div className="mb-4 rounded-lg bg-amber/10 p-3 text-center text-sm text-amber">
          SMS provider indicates {smsCredits.toLocaleString()} credits remaining (not a dollar value).
        </div>
      )}

      {tab === 'send' && (
        <Card>
          <div className="mb-2 text-sm font-extrabold text-ink">Select members</div>
          <p className="mb-4 text-sm text-ink/60">"Email and SMS" and "SMS" are different — select both if you want to reach everyone who can receive SMS.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Age from"><Input type="number" value={filter.ageMin} onChange={(e) => setFilter({ ...filter, ageMin: e.target.value })} /></Field>
            <Field label="Age to"><Input type="number" value={filter.ageMax} onChange={(e) => setFilter({ ...filter, ageMax: e.target.value })} /></Field>
            <Field label="Gender">
              <Select value={filter.gender} onChange={(e) => setFilter({ ...filter, gender: e.target.value })}>
                <option value="">Any</option><option value="MALE">Male</option><option value="FEMALE">Female</option>
              </Select>
            </Field>
            <Field label="City">
              <Select value={filter.cityId} onChange={(e) => setFilter({ ...filter, cityId: e.target.value })}>
                <option value="">All</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Contact method">
              <Select value={filter.contactMethod} onChange={(e) => setFilter({ ...filter, contactMethod: e.target.value })}>
                <option value="">Any</option>
                <option value="EMAIL_AND_SMS">Email and SMS</option>
                <option value="EMAIL">Email</option>
                <option value="SMS">SMS</option>
              </Select>
            </Field>
          </div>
          <Button variant="ghost" onClick={handlePreview} className="mb-4 w-full">Filter</Button>
          {previewCount !== null && (
            <div className="mb-4 rounded-lg bg-plum/10 p-3 text-center font-extrabold text-plum">{previewCount.toLocaleString()} members filtered</div>
          )}

          {activeSend ? (
            <div className="mb-4 rounded-lg bg-cream/50 p-3 text-center text-sm">
              <div className="text-xl font-extrabold text-plum">{activeSend.sentCount} / {activeSend.totalRecipients}</div>
              <div className="mb-3 text-ink/50">{activeSend.status === 'PAUSED' ? 'paused' : 'sending…'}</div>
              <div className="flex justify-center gap-2">
                {activeSend.status === 'SENDING' && <Button variant="ghost" onClick={handlePause}>Pause</Button>}
                {activeSend.status === 'PAUSED' && <Button onClick={handleResume}>Resume</Button>}
                <Button variant="danger" onClick={handleCancel}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button onClick={handleSendNow} className="w-full">Send Blast Now</Button>
          )}
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
