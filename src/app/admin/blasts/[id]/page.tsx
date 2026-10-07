'use client';

import { Suspense, useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Field, Input, Select, Button, Card, Badge, Loader, BackLink } from '@/components/ui';
import BlastTestSend from '@/components/BlastTestSend';
import BlastSendProgress, { blastOutcome } from '@/components/BlastSendProgress';
import SmsCounter from '@/components/SmsCounter';
import EmailPreview from '@/components/EmailPreview';
import { withOptOut } from '@/lib/sms/optOut';
import {
  boxesFromSavedFilter, filterWithBoxes, otherSavedFilterParts,
  CONTACT_METHODS, CONTACT_METHOD_LABELS, type SendTabBoxes,
} from '@/lib/campaigns/sendTabFilter';

interface Campaign {
  id: string; title: string; hasBeenSent: boolean; subject: string; sendEmail: boolean; sendSms: boolean;
  reusable: boolean; smsBody: string | null;
  // Who the next send goes to (see Campaign.filter).
  filter: unknown;
}
interface Send { id: string; status: string; sentCount: number; failedCount?: number; totalRecipients: number; startedAt: string; }
interface City { id: string; name: string; }
// Matches what POST /preview already returns (capped at 200 rows).
interface PreviewMember { id: string; name: string; email: string; mobile: string; gender: string; contactMethod: string; city: { name: string }; }

function ViewBlastInner() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<'details' | 'send' | 'history'>((search.get('tab') as any) ?? 'details');
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [sends, setSends] = useState<Send[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  // The Send tab's boxes, opened on the blast's saved filter, and the saved
  // filter itself (which may hold a Members-list search the tab has no box for).
  const [boxes, setBoxes] = useState<SendTabBoxes | null>(null);
  const [savedFilter, setSavedFilter] = useState<unknown>({});
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewMembers, setPreviewMembers] = useState<PreviewMember[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [activeSend, setActiveSend] = useState<Send | null>(null);
  const [smsCredits, setSmsCredits] = useState<number | null>(null);
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null);
  const [confirmingSend, setConfirmingSend] = useState(false);
  // The send that has just COMPLETED, so the admin gets told it finished
  // instead of being left staring at "sending…".
  const [justSent, setJustSent] = useState<Send | null>(null);
  // The send request is in flight (see handleConfirmSend).
  const [startingSend, setStartingSend] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // Counting the filtered members (the Filter button).
  const [previewing, setPreviewing] = useState(false);
  // "Stop re-using blast" asks first: it used to act on the first click.
  const [confirmingRetire, setConfirmingRetire] = useState(false);
  const [retireBusy, setRetireBusy] = useState(false);

  function loadCampaign() {
    return fetch(`/api/admin/campaigns/${id}`).then((r) => r.json()).then((c: Campaign) => {
      setCampaign(c);
      return c;
    });
  }
  function loadHistory() {
    fetch(`/api/admin/campaigns/${id}/sends`).then((r) => r.json()).then((data) => {
      setSends(data);
      const inProgress = data.find((s: Send) => s.status === 'SENDING' || s.status === 'PAUSED');
      setActiveSend(inProgress ?? null);
    });
  }

  // The real rendered email, via the same function the send loop uses.
  function loadRenderedPreview() {
    fetch(`/api/admin/campaigns/${id}/render-preview`).then((r) => r.json()).then((d) => setRenderedHtml(d.html));
  }

  useEffect(() => {
    // The Send tab opens on the audience saved with the blast — it used to
    // open empty, and sending then replaced that audience with the blanks.
    loadCampaign().then((c) => {
      setSavedFilter(c.filter ?? {});
      setBoxes(boxesFromSavedFilter(c.filter));
    });
    loadHistory(); loadRenderedPreview();
    fetch('/api/cities').then((r) => r.json()).then(setCities);
    fetch('/api/admin/sms-credits').then((r) => r.json()).then((d) => setSmsCredits(d.credits));
  }, [id]);

  // Shared by preview and send so the count shown is built from exactly the
  // same filter that gets locked in: the saved filter with the boxes applied
  // (anything the tab has no box for, like a Members-list search, is kept).
  function currentFilterPayload() {
    return boxes ? filterWithBoxes(savedFilter, boxes) : savedFilter;
  }

  // Any change to who it goes to makes the last count out of date, so it's
  // cleared rather than left on screen to be confirmed.
  function clearCount() {
    setPreviewCount(null);
    setPreviewMembers([]);
    setShowMembers(false);
  }
  function changeBoxes(patch: Partial<SendTabBoxes>) {
    setBoxes((b) => (b ? { ...b, ...patch } : b));
    clearCount();
  }
  function removeSavedPart(key: string) {
    setSavedFilter((f: unknown) => {
      const next = { ...(f && typeof f === 'object' ? (f as Record<string, unknown>) : {}) };
      delete next[key];
      return next;
    });
    clearCount();
  }

  /** Counts the members the current boxes reach. Returns the count, or null if it couldn't. */
  async function handlePreview(): Promise<number | null> {
    setPreviewing(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${id}/preview`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: currentFilterPayload() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.count !== 'number') throw new Error();
      setPreviewCount(data.count);
      setPreviewMembers(data.members ?? []);
      setShowMembers(false);
      return data.count;
    } catch {
      setSendError('Could not count the members. Check your connection and try again.');
      return null;
    } finally {
      setPreviewing(false);
    }
  }

  // "Send Blast Now" no longer sends immediately — it opens one final review
  // (the actual rendered content plus the exact filtered count) that has to
  // be explicitly confirmed. This is the "preview final time" step in the
  // requested flow: Save -> Preview -> edit -> filter members -> preview
  // final time -> send.
  //
  // Always counted afresh here, so the number confirmed is the number that go.
  async function handleSendBlastNowClick() {
    if ((await handlePreview()) === null) return;
    setConfirmingSend(true);
  }

  async function handleConfirmSend() {
    setConfirmingSend(false);
    setSendError(null);
    setJustSent(null);
    // From the click until the first progress check comes back, show that
    // it's sending. "Send Blast Now" is out of reach meanwhile, so it can't
    // be clicked twice (and the server refuses a second send while one is going).
    setStartingSend(true);
    try {
      const filterToSave = currentFilterPayload();
      const saved = await fetch(`/api/admin/campaigns/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: filterToSave }),
      });
      // Don't send to an audience that wasn't saved: the send reads the saved one.
      if (!saved.ok) {
        const data = await saved.json().catch(() => ({}));
        setSendError(typeof data.error === 'string' ? data.error : 'The blast could not be sent.');
        return;
      }
      setSavedFilter(filterToSave);
      const res = await fetch(`/api/admin/campaigns/${id}/send`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      // A refused send (e.g. a blast set to stop re-using) used to vanish
      // silently, leaving the admin waiting for progress that never came.
      if (!res.ok) {
        setSendError(typeof data.error === 'string' ? data.error : 'The blast could not be sent.');
        // A send already going (or paused) shows with its Pause / Cancel buttons.
        loadHistory();
        return;
      }
      // Poll for progress
      await pollSend();
    } catch {
      setSendError('The blast could not be sent. Check your connection and try again.');
    } finally {
      setStartingSend(false);
    }
  }

  async function pollSend() {
    loadHistory();
    const latest = await fetch(`/api/admin/campaigns/${id}/sends`).then((r) => r.json());
    const current = latest[0];

    // Only an in-flight send belongs in `activeSend`. This used to assign
    // `latest[0]` unconditionally, so a FINISHED send stayed there and the
    // progress block — whose label was a two-way ternary with no completion
    // branch — sat on "N/N sending…" forever.
    const inFlight = current && (current.status === 'SENDING' || current.status === 'PAUSED');
    setActiveSend(inFlight ? current : null);
    setJustSent(current && current.status === 'SENT' ? current : null);

    if (current && current.status === 'SENDING') {
      setTimeout(() => pollSend(), 2000);
    }
  }

  // Straight into editing the copy, as with Duplicate event.
  async function handleDuplicate() {
    const res = await fetch(`/api/admin/campaigns/${id}/duplicate`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) router.push(`/admin/blasts/${data.id}/edit`);
  }

  // "Stop re-using blast" (after confirming) and its undo, "Use again".
  async function setReusable(reusable: boolean) {
    setRetireBusy(true);
    try {
      await fetch(`/api/admin/campaigns/${id}/${reusable ? 'reuse' : 'stop-reusing'}`, { method: 'POST' });
      await loadCampaign();
      setConfirmingRetire(false);
    } finally {
      setRetireBusy(false);
    }
  }

  async function handlePause() {
    if (!activeSend) return;
    await fetch(`/api/admin/campaigns/${id}/sends/${activeSend.id}/pause`, { method: 'POST' });
    loadHistory();
  }
  async function handleResume() {
    if (!activeSend) return;
    await fetch(`/api/admin/campaigns/${id}/sends/${activeSend.id}/resume`, { method: 'POST' });
    pollSend();
  }
  async function handleCancel() {
    if (!activeSend) return;
    if (!confirm('Cancel this send? It cannot be resumed once cancelled.')) return;
    await fetch(`/api/admin/campaigns/${id}/sends/${activeSend.id}/cancel`, { method: 'POST' });
    loadHistory();
  }

  if (!campaign || !boxes) return <Loader label="Loading blast…" />;
  // The send route refuses these (a retired blast can't be sent again).
  const retiredAndSent = !campaign.reusable && campaign.hasBeenSent;
  const savedParts = otherSavedFilterParts(savedFilter);

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/admin/blasts">Back to blasts</BackLink>
      <h1 className="mb-2 flex flex-wrap items-center gap-2 text-2xl font-extrabold text-ink">
        {campaign.title}
        {!campaign.reusable && <Badge tone="muted">Retired</Badge>}
      </h1>

      <div className="mb-4 flex gap-3 text-sm">
        {/* Both, always: a sent blast can be edited and sent again (Gil). */}
        <button onClick={() => router.push(`/admin/blasts/${id}/edit`)} className="font-bold text-plum underline">Edit Blast</button>
        <button onClick={handleDuplicate} className="font-bold text-plum underline">Duplicate Blast</button>
        {campaign.reusable ? (
          <button onClick={() => setConfirmingRetire(true)} className="font-bold text-plum underline">Stop re-using blast</button>
        ) : (
          <button onClick={() => setReusable(true)} disabled={retireBusy} className="font-bold text-plum underline disabled:opacity-50">Use again</button>
        )}
      </div>

      {confirmingRetire && campaign.reusable && (
        <div role="alertdialog" className="mb-4 rounded-lg border border-coral/30 bg-coral/5 p-4 text-sm">
          <p className="mb-3 text-ink">
            Stop re-using this blast? Once it has been sent it can&apos;t be sent again, and it&apos;s left out of
            &ldquo;Blast filtered members&rdquo;. Its history is kept, and &ldquo;Use again&rdquo; undoes this.
          </p>
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => setReusable(false)} disabled={retireBusy} loading={retireBusy}>Stop re-using</Button>
            <Button variant="ghost" onClick={() => setConfirmingRetire(false)} disabled={retireBusy}>Keep using it</Button>
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-2">
        {(['details', 'send', 'history'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-full px-3 py-1.5 text-sm font-bold ${tab === t ? 'bg-plum text-white' : 'bg-plum/10 text-plum'}`}>
            {t === 'details' ? 'Preview' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <Card>
          <div className="mb-4 border-b border-ink/5 pb-2">
            <BlastTestSend campaignId={id} />
          </div>
          <Row label="Send Email?" value={campaign.sendEmail ? 'Yes' : 'No'} />
          <Row label="Email subject" value={campaign.subject} />
          <Row label="Send SMS?" value={campaign.sendSms ? 'Yes' : 'No'} />

          {/* The text exactly as members get it, so its wording and cost can
              be checked before sending. */}
          {campaign.sendSms && (
            <>
              <div className="mt-5 text-sm font-extrabold text-ink">Preview: the text message</div>
              <p className="mb-2 text-xs text-ink/50">Exactly what members receive, opt-out line included.</p>
              <div className="mb-1 whitespace-pre-wrap rounded-lg border border-ink/10 bg-cream/40 p-3 text-sm text-ink">
                {withOptOut(campaign.smsBody ?? '') || <span className="text-ink/40">No message yet. Add one with Edit Blast.</span>}
              </div>
              <SmsCounter body={campaign.smsBody ?? ''} />
            </>
          )}

          <div className="mt-5 text-sm font-extrabold text-ink">Preview: how it actually renders</div>
          <p className="mb-2 text-xs text-ink/50">This is the real email, not a mockup. Edit the blast if anything here needs to change.</p>
          {/* Sandboxed (EmailPreview): without it, a srcDoc frame runs any
              script in the email as the logged-in admin, on this site. A pasted
              emailBody is sent exactly as written, so the preview can't assume
              it's harmless. */}
          {renderedHtml ? (
            <EmailPreview html={renderedHtml} className="h-[420px] w-full rounded-lg border border-ink/10 bg-white" />
          ) : (
            <Loader label="Loading preview…" className="py-8" />
          )}
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
          <p className="mb-4 text-sm text-ink/60">"Email and SMS" and "SMS" are different. Select both if you want to reach everyone who can receive SMS.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Age from"><Input type="number" min={0} value={boxes.ageMin} onChange={(e) => changeBoxes({ ageMin: e.target.value })} /></Field>
            <Field label="Age to"><Input type="number" min={0} value={boxes.ageMax} onChange={(e) => changeBoxes({ ageMax: e.target.value })} /></Field>
            <Field label="Gender">
              <Select value={boxes.gender} onChange={(e) => changeBoxes({ gender: e.target.value as SendTabBoxes['gender'] })}>
                <option value="">Any</option><option value="MALE">Male</option><option value="FEMALE">Female</option>
              </Select>
            </Field>
            <Field label="City">
              <Select value={boxes.cityId} onChange={(e) => changeBoxes({ cityId: e.target.value })}>
                <option value="">All</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
          {/* Ticks, not a dropdown, so "select both" above can be followed.
              None ticked: any. */}
          <Field label="Contact method">
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink">
              {CONTACT_METHODS.map((m) => (
                <label key={m} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={boxes.contactMethods.includes(m)}
                    onChange={(e) => changeBoxes({
                      contactMethods: e.target.checked ? [...boxes.contactMethods, m] : boxes.contactMethods.filter((x) => x !== m),
                    })}
                  />
                  {CONTACT_METHOD_LABELS[m]}
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink/50">How each member asked to be contacted. Leave all unticked for any.</p>
          </Field>
          {savedParts.map((part) => (
            <div key={part.key} className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-cream/60 px-3 py-2 text-sm">
              <span className="text-ink/70">Also saved with this blast (from the Members list): <b className="text-ink">{part.label}</b></span>
              <button onClick={() => removeSavedPart(part.key)} className="shrink-0 text-xs font-bold text-plum underline">Remove</button>
            </div>
          ))}
          <Button variant="ghost" onClick={handlePreview} disabled={previewing} loading={previewing} className="mb-4 w-full">Filter</Button>
          {previewCount !== null && (
            <div className="mb-4 rounded-lg bg-plum/10 p-3">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-plum">{previewCount.toLocaleString()} members filtered</span>
                {previewCount > 0 && (
                  <button onClick={() => setShowMembers(!showMembers)} className="text-xs font-bold text-plum underline">
                    {showMembers ? 'Hide' : 'Show'}
                  </button>
                )}
              </div>
              {showMembers && (
                <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-plum/10 bg-white">
                  {previewMembers.map((m) => (
                    <div key={m.id} className="border-b border-ink/5 px-3 py-2 text-xs last:border-0">
                      <span className="font-bold text-ink">{m.name}</span>
                      <span className="text-ink/50"> · {m.email} · {m.mobile} · {m.city?.name}</span>
                    </div>
                  ))}
                  {/* The preview API caps at 200 rows. */}
                  {previewMembers.length < (previewCount ?? 0) && (
                    <div className="px-3 py-2 text-xs text-ink/40">Showing first {previewMembers.length} of {previewCount}.</div>
                  )}
                </div>
              )}
            </div>
          )}

          {sendError && <p role="alert" className="mb-4 text-sm font-medium text-coral">{sendError}</p>}
          {retiredAndSent && !activeSend && (
            <p className="mb-4 rounded-lg bg-ink/5 p-3 text-sm text-ink/70">
              This blast is retired, so it can&apos;t be sent again. Press &ldquo;Use again&rdquo; at the top to send it.
            </p>
          )}
          {startingSend ? (
            <BlastSendProgress status="STARTING" total={previewCount ?? 0} />
          ) : (
            <>
              {justSent && !activeSend && (
                <BlastSendProgress status="SENT" sentCount={justSent.sentCount} failedCount={justSent.failedCount} total={justSent.totalRecipients} />
              )}
              {activeSend ? (
                <BlastSendProgress status={activeSend.status} sentCount={activeSend.sentCount} failedCount={activeSend.failedCount} total={activeSend.totalRecipients}>
                  <div className="flex justify-center gap-2">
                    {activeSend.status === 'SENDING' && <Button variant="ghost" onClick={handlePause}>Pause</Button>}
                    {activeSend.status === 'PAUSED' && <Button onClick={handleResume}>Resume</Button>}
                    <Button variant="danger" onClick={handleCancel}>Cancel</Button>
                  </div>
                </BlastSendProgress>
              ) : (
                // Greyed out once the send has finished, so it's clear the blast
                // has just gone and it isn't sent twice by mistake. Reopening
                // the blast starts afresh, ready to send again.
                <Button onClick={handleSendBlastNowClick} disabled={previewing || !!justSent || retiredAndSent} loading={previewing} className="w-full">Send Blast Now</Button>
              )}
            </>
          )}
        </Card>
      )}

      {tab === 'history' && (
        <div className="space-y-2">
          {sends.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-ink/10 bg-white p-3">
              <div>
                <div className="text-sm font-bold text-ink">{new Date(s.startedAt).toLocaleString('en-AU')}</div>
                {/* Failures used to be counted as sent. */}
                <div className={`text-xs ${s.failedCount ? 'font-bold text-coral' : 'text-ink/50'}`}>
                  {s.failedCount ? blastOutcome(s.sentCount - s.failedCount, s.failedCount) : `${s.sentCount} / ${s.totalRecipients} sent`}
                </div>
              </div>
              <Badge tone={s.status === 'SENT' ? 'green' : 'muted'}>{s.status}</Badge>
            </div>
          ))}
          {sends.length === 0 && <p className="text-sm text-ink/50">No sends yet.</p>}
        </div>
      )}

      {/* Final confirmation — the "preview final time" step. Shows the same
          rendered email plus the exact locked-in count, and requires an
          explicit second click before anything actually sends. */}
      {confirmingSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" onClick={() => setConfirmingSend(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-lg font-extrabold text-ink">Confirm and send</h2>
            <p className="mb-3 text-sm text-ink/60">
              This will send to <b>{(previewCount ?? 0).toLocaleString()} members</b> right now. This is the last chance to check before it goes out.
            </p>
            {campaign.sendEmail && renderedHtml && <EmailPreview html={renderedHtml} className="mb-4 h-72 w-full rounded-lg border border-ink/10" title="Final preview" />}
            {campaign.sendSms && (
              <div className="mb-4">
                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink/50">Text message</div>
                <div className="whitespace-pre-wrap rounded-lg border border-ink/10 bg-cream/40 p-3 text-sm text-ink">{withOptOut(campaign.smsBody ?? '')}</div>
                <SmsCounter body={campaign.smsBody ?? ''} className="mt-1" />
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setConfirmingSend(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleConfirmSend} className="flex-1">Confirm &amp; Send Now</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// useSearchParams() forces client-side rendering, which Next requires to sit
// behind a Suspense boundary — without one, `next build` fails prerendering.
export default function ViewBlastPage() {
  return (
    <Suspense fallback={null}>
      <ViewBlastInner />
    </Suspense>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-ink/5 py-2.5 text-sm last:border-0">
      <span className="text-ink/50">{label}</span><span className="font-bold text-ink">{value}</span>
    </div>
  );
}
