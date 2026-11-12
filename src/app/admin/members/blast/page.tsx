'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Button, Card, Field, Input, Select, Loader, BackLink } from '@/components/ui';
import BlastFields, { blastContentFrom, type BlastContent } from '@/components/BlastFields';
import BlastTestSend from '@/components/BlastTestSend';
import { resolveCampaignEmailHtml } from '@/lib/emails/campaignEmail';
import { memberFilterFromParams, memberFilterToParams, describeMemberFilter } from '@/lib/memberFilterParams';
import BlastSendProgress from '@/components/BlastSendProgress';
import EmailPreview from '@/components/EmailPreview';
import Modal from '@/components/Modal';
import { countOf } from '@/lib/plural';
import { leftOutSentence, leftOutPart, type LeftOutGroup } from '@/lib/campaigns/leftOut';

interface BlastOption { id: string; title: string; blastStatus: string; reusable: boolean; hasBeenSent: boolean }
interface City { id: string; name: string }
interface SendState { id?: string; status: string; sentCount: number; failedCount?: number; totalRecipients: number }
/** "See who": a reason, its first names, and how many more (src/lib/campaigns/leftOutQuery.ts). */
interface LeftOutList extends LeftOutGroup { members: { id: string; name: string; email: string; mobile: string }[]; more: number }

const NEW = '__new__';
const EMPTY: BlastContent = {
  sendEmail: true, sendSms: false, subject: '', heading: '', freeText: '', eventDetailsText: '',
  bookingLink: '', photoUrl: '', venueLogoUrl: '', smsBody: '', ignorePreference: false,
  excludeBooked: false, excludeBookedEventId: null,
};

/**
 * "Click here to blast these filtered members" — the old admin's Blast page.
 * Takes the Members screen's filter (in the URL), lets the admin pick one of
 * their blasts (which fills in its content, editable here), test it, and send
 * it to exactly those members.
 *
 * Edits are saved to that blast, since Gil re-uses and edits his blasts
 * rather than writing a new one each time. Sending saves first, stores this
 * filter as the blast's recipients, then starts the normal send — so it shows
 * in the blast's History like any other send.
 */
export default function BlastFilteredMembersPage() {
  const [query, setQuery] = useState<string | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [blasts, setBlasts] = useState<BlastOption[]>([]);
  const [smsCredits, setSmsCredits] = useState<number | null>(null);

  const [selected, setSelected] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState<BlastContent>(EMPTY);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [audience, setAudience] = useState<{ matching: number; recipients: number; leftOut: LeftOutGroup[] } | null>(null);
  // "See who": the members left out, under each reason. Loaded when opened.
  const [seeWho, setSeeWho] = useState(false);
  const [leftOutList, setLeftOutList] = useState<LeftOutList[] | null>(null);
  const [leftOutError, setLeftOutError] = useState(false);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [send, setSend] = useState<SendState | null>(null);
  // The send request is in flight (see handleConfirmSend).
  const [starting, setStarting] = useState(false);

  const filter = useMemo(() => memberFilterFromParams(new URLSearchParams(query ?? '')), [query]);
  const summary = describeMemberFilter(filter, cities.find((c) => c.id === filter.cityId)?.name);
  const campaignId = selected && selected !== NEW ? selected : null;
  const dirty = JSON.stringify({ title, content }) !== savedSnapshot;

  function loadBlasts() {
    return fetch('/api/admin/campaigns').then((r) => r.json()).then((list: BlastOption[]) => {
      // "Stop re-using" blasts that have been sent can't be sent again.
      setBlasts(list.filter((b) => b.reusable || !b.hasBeenSent));
    });
  }

  useEffect(() => {
    // Normalised, so only the Members screen's own filter fields come along.
    setQuery(memberFilterToParams(memberFilterFromParams(new URLSearchParams(window.location.search))).toString());
    fetch('/api/cities').then((r) => r.json()).then(setCities);
    fetch('/api/admin/sms-credits').then((r) => r.json()).then((d) => setSmsCredits(typeof d?.credits === 'number' ? d.credits : null)).catch(() => {});
    loadBlasts();
  }, []);

  // How many of the filtered members this blast reaches, given its channels
  // and each member's own preferences — the same rules the send applies.
  useEffect(() => {
    if (query === null) return;
    const t = setTimeout(() => {
      fetch('/api/admin/members/blast-audience', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query, sendEmail: content.sendEmail, sendSms: content.sendSms, ignorePreference: content.ignorePreference,
          excludeBooked: content.excludeBooked, excludeBookedEventId: content.excludeBookedEventId,
        }),
      }).then((r) => r.json()).then((d) => setAudience({ matching: d.matching, recipients: d.recipients, leftOut: Array.isArray(d.leftOut) ? d.leftOut : [] }));
    }, 250);
    return () => clearTimeout(t);
  }, [query, content.sendEmail, content.sendSms, content.ignorePreference, content.excludeBooked, content.excludeBookedEventId]);

  // "See who": the names behind the counts, for the same filter and settings.
  // Fetched again whenever those change while it's open.
  useEffect(() => {
    if (query === null || !seeWho) return;
    setLeftOutList(null);
    setLeftOutError(false);
    const t = setTimeout(() => {
      fetch('/api/admin/members/blast-audience', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query, sendEmail: content.sendEmail, sendSms: content.sendSms, ignorePreference: content.ignorePreference,
          excludeBooked: content.excludeBooked, excludeBookedEventId: content.excludeBookedEventId, details: true,
        }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d) => setLeftOutList(Array.isArray(d.leftOutMembers) ? d.leftOutMembers : []))
        .catch(() => setLeftOutError(true));
    }, 250);
    return () => clearTimeout(t);
  }, [seeWho, query, content.sendEmail, content.sendSms, content.ignorePreference, content.excludeBooked, content.excludeBookedEventId]);

  async function choose(id: string) {
    if (dirty && selected && !confirm('Discard your unsaved changes to this blast?')) return;
    setMessage(null);
    setSend(null);
    setSelected(id);
    if (id === NEW || !id) {
      setTitle('');
      setContent(EMPTY);
      setSavedSnapshot(JSON.stringify({ title: '', content: EMPTY }));
      return;
    }
    const c = await fetch(`/api/admin/campaigns/${id}`).then((r) => r.json());
    const loaded = blastContentFrom(c);
    setTitle(c.title);
    setContent(loaded);
    setSavedSnapshot(JSON.stringify({ title: c.title, content: loaded }));
  }

  /** Saves the content (and this filter as its recipients). Returns the blast id. */
  async function save(): Promise<string | null> {
    setSaving(true);
    setMessage(null);
    const body = { title, ...content, filter };
    const res = campaignId
      ? await fetch(`/api/admin/campaigns/${campaignId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/admin/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMessage({ ok: false, text: typeof data.error === 'string' ? data.error : 'Please check the blast. A title and an email subject are needed.' });
      return null;
    }
    setSavedSnapshot(JSON.stringify({ title, content }));
    if (!campaignId) {
      await loadBlasts();
      setSelected(data.id);
    }
    return data.id as string;
  }

  async function handleSave() {
    if (await save()) setMessage({ ok: true, text: 'Blast saved.' });
  }

  async function handleConfirmSend() {
    setConfirming(false);
    // Shows "Sending…" from the click until the first progress check comes
    // back; without this nothing on screen said it was going.
    setStarting(true);
    setSend(null);
    try {
      const id = await save();
      if (!id) return;
      const res = await fetch(`/api/admin/campaigns/${id}/send`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ ok: false, text: typeof data.error === 'string' ? data.error : 'The blast could not be sent.' });
        // A send of this blast already going shows its progress.
        const [latest] = await fetch(`/api/admin/campaigns/${id}/sends`).then((r) => r.json()).catch(() => []);
        if (latest && (latest.status === 'SENDING' || latest.status === 'PAUSED')) await pollSend(id);
        return;
      }
      await pollSend(id);
    } catch {
      setMessage({ ok: false, text: 'The blast could not be sent. Check your connection and try again.' });
    } finally {
      setStarting(false);
    }
  }

  // The first batch goes out straight after the send starts; bigger lists
  // are carried on by the scheduled job, so keep checking until it's done.
  async function pollSend(id: string) {
    const [latest] = await fetch(`/api/admin/campaigns/${id}/sends`).then((r) => r.json());
    if (!latest) return;
    setSend(latest);
    if (latest.status === 'SENDING') setTimeout(() => pollSend(id), 2000);
  }

  const previewHtml = useMemo(
    () => (content.sendEmail ? resolveCampaignEmailHtml(content, '#') : null),
    [content],
  );

  if (query === null) return <Loader />;
  const canSend = !!selected && (content.sendEmail || content.sendSms) && (audience?.recipients ?? 0) > 0 && !saving;
  const backHref = `/admin/members${query ? `?${query}` : ''}`;

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href={backHref}>Back to members</BackLink>
      <h1 className="mb-4 text-2xl font-extrabold text-ink">Blast filtered members</h1>

      <Card className="mb-4">
        <p className="text-sm text-ink">
          <strong>Members currently selected:</strong> {audience ? audience.matching.toLocaleString() : '…'}
        </p>
        <p className="mt-1 text-sm text-ink">
          <strong>Filter currently applied:</strong>{' '}
          <span className="text-ink/70">{summary.length ? summary.join(' · ') : 'none (every member)'}</span>
        </p>
      </Card>

      {content.sendSms && smsCredits !== null && (
        <div className="mb-4 rounded-lg bg-amber/10 p-3 text-center text-sm text-amber">
          SMS provider indicates {smsCredits.toLocaleString()} credits remaining (not a dollar value).
        </div>
      )}

      <Card className="mb-4">
        <Field label="Blast">
          <Select value={selected} onChange={(e) => choose(e.target.value)}>
            <option value="">Choose a blast…</option>
            <option value={NEW}>+ Start a new blast</option>
            {blasts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} ({b.blastStatus === 'UNUSED' ? 'unused' : b.blastStatus.toLowerCase()})
              </option>
            ))}
          </Select>
        </Field>
        <p className="-mt-2 text-xs text-ink/50">
          Picking a blast fills in its content below. Changes you make are saved to that blast.
        </p>
      </Card>

      {selected && (
        <>
          <Card className="mb-4">
            <Field label="Title"><Input required value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <BlastFields value={content} onChange={(patch) => setContent((c) => ({ ...c, ...patch }))} />
          </Card>

          {previewHtml && (
            <Card className="mb-4">
              <div className="mb-2 text-sm font-extrabold text-ink">Email preview</div>
              {/* Sandboxed (EmailPreview): without it, a srcDoc frame runs any
                  script in the email as the logged-in admin, on this site. The
                  template escapes what it renders; the preview shouldn't rely on that. */}
              <EmailPreview html={previewHtml} className="h-[420px] w-full rounded-lg border border-ink/10 bg-white" />
            </Card>
          )}

          <Card className="mb-4">
            <div className="mb-3 text-sm font-extrabold text-ink">Send a test</div>
            <BlastTestSend
              campaignId={campaignId}
              content={{ subject: content.subject, heading: content.heading, freeText: content.freeText, eventDetailsText: content.eventDetailsText, bookingLink: content.bookingLink, photoUrl: content.photoUrl, venueLogoUrl: content.venueLogoUrl, smsBody: content.smsBody }}
            />
          </Card>

          <Card className="mb-4">
            {audience && (
              <p className="mb-3 text-sm text-ink">
                <strong className="text-plum">{audience.recipients.toLocaleString()}</strong> of the {countOf(audience.matching, 'filtered member', 'filtered members')} will receive this blast.
                {audience.recipients < audience.matching && (
                  <span className="block text-xs text-ink/50">
                    {!content.sendEmail && !content.sendSms ? (
                      'Tick “Send Email” or “Send SMS” to choose how it goes out.'
                    ) : audience.leftOut.length > 0 && (
                      <>
                        {leftOutSentence(audience.leftOut)}{' '}
                        <button type="button" onClick={() => setSeeWho(!seeWho)} className="font-bold text-plum underline">
                          {seeWho ? 'Hide' : 'See who'}
                        </button>
                      </>
                    )}
                  </span>
                )}
              </p>
            )}
            {/* Who's left out, under each reason. A name opens the member's
                page in a new tab, so this blast isn't lost. */}
            {seeWho && audience && audience.recipients < audience.matching && (content.sendEmail || content.sendSms) && (
              <div className="mb-3 max-h-80 overflow-y-auto rounded-lg border border-ink/10 bg-white text-xs">
                {leftOutError ? (
                  <p className="px-3 py-2 font-medium text-coral">Couldn’t load the list. Please try again.</p>
                ) : !leftOutList ? (
                  <p className="px-3 py-2 text-ink/50">Loading…</p>
                ) : (
                  <>
                    <p className="px-3 py-2 text-ink/50">A name opens the member’s page in a new tab, where you can check or change their details.</p>
                    {leftOutList.map((g) => (
                      <div key={g.key} className="border-t border-ink/5">
                        <div className="bg-plum/5 px-3 py-1.5 font-bold text-ink">{leftOutPart(g)}</div>
                        {g.members.map((m) => (
                          <a key={m.id} href={`/admin/members/${m.id}`} target="_blank" rel="noreferrer" className="block px-3 py-1.5 hover:bg-plum/5">
                            <span className="font-bold text-ink">{m.name}</span>
                            <span className="text-ink/50"> · {m.email}{m.mobile ? ` · ${m.mobile}` : ''}</span>
                          </a>
                        ))}
                        {g.more > 0 && <p className="px-3 py-1.5 text-ink/40">and {g.more.toLocaleString('en-AU')} more</p>}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
            {message && (
              <p role="status" className={`mb-3 rounded-lg p-3 text-sm ${message.ok ? 'bg-green/15 font-bold text-green-dark' : 'bg-coral/10 font-medium text-coral'}`}>
                {message.text}
              </p>
            )}
            {starting && <BlastSendProgress status="STARTING" total={audience?.recipients ?? 0} />}
            {send && !starting && (
              <BlastSendProgress status={send.status} sentCount={send.sentCount} failedCount={send.failedCount} total={send.totalRecipients}>
                {campaignId && (
                  <Link href={`/admin/blasts/${campaignId}?tab=history`} className="text-xs font-bold text-plum underline">
                    View this blast&apos;s history
                  </Link>
                )}
              </BlastSendProgress>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={handleSave} disabled={saving || starting || !dirty} loading={saving && !starting} className="flex-1">
                {saving ? 'Saving…' : dirty ? 'Save blast' : 'Saved'}
              </Button>
              <Button onClick={() => setConfirming(true)} disabled={!canSend || starting || send?.status === 'SENDING'} loading={starting} className="flex-1">
                Send to {countOf(audience?.recipients ?? 0, 'member', 'members')}
              </Button>
            </div>
          </Card>
        </>
      )}

      {/* The last check before anything goes out. */}
      {confirming && audience && (
        <Modal title="Confirm and send" onClose={() => setConfirming(false)} wide>
            <p className="mb-3 text-sm text-ink/60">
              &ldquo;{title}&rdquo; will be {content.sendEmail && content.sendSms ? 'emailed and texted' : content.sendEmail ? 'emailed' : 'texted'} to{' '}
              <b>{countOf(audience.recipients, 'member', 'members')}</b> right now.{dirty ? ' Your changes are saved to the blast first.' : ''}
            </p>
            {previewHtml && <EmailPreview html={previewHtml} className="mb-4 h-72 w-full rounded-lg border border-ink/10" title="Final preview" />}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setConfirming(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleConfirmSend} className="flex-1">Confirm &amp; Send Now</Button>
            </div>
        </Modal>
      )}
    </div>
  );
}
