'use client';

import { useEffect, useState } from 'react';
import { Button, Field, Input } from '@/components/ui';

type Content = Partial<Record<'subject' | 'heading' | 'freeText' | 'eventDetailsText' | 'bookingLink' | 'photoUrl' | 'venueLogoUrl' | 'smsBody', string>>;

/**
 * "Send test email to" / "Send test SMS to", as on the old admin: a test email
 * goes to an email address and a test SMS to a mobile. Both are always
 * offered, whichever channels the blast itself uses (Gil). Pre-filled with the
 * logged-in admin's own details, and says what actually happened — including
 * the provider's reason if a send is refused.
 *
 * `content` (optional) is what's on screen, so an unsaved edit can be tested
 * before it's saved.
 */
export default function BlastTestSend({
  campaignId, content,
}: { campaignId: string | null; content?: Content }) {
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [busy, setBusy] = useState<'email' | 'sms' | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((d) => {
      if (d?.member) { setEmail((v) => v || d.member.email || ''); setMobile((v) => v || d.member.mobile || ''); }
    }).catch(() => {});
  }, []);

  async function send(channel: 'email' | 'sms') {
    if (!campaignId) return;
    setBusy(channel);
    setResult(null);
    const res = await fetch(`/api/admin/campaigns/${campaignId}/test-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(channel === 'email' ? { email, content } : { mobile, content }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(null);
    if (res?.ok) setResult({ ok: true, text: channel === 'email' ? data.email : data.sms });
    else setResult({ ok: false, text: data.errors?.join(' ') || data.error || 'The test couldn’t be sent. Please try again.' });
  }

  return (
    <div>
      {!campaignId && <p className="mb-3 text-xs text-ink/50">Save the blast first, then send yourself a test.</p>}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Field label="Send test email to">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
          </Field>
        </div>
        <Button type="button" className="mb-4" onClick={() => send('email')} disabled={!campaignId || !email.trim() || busy !== null} loading={busy === 'email'}>
          {busy === 'email' ? 'Sending…' : 'Send test email'}
        </Button>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Field label="Send test SMS to">
            <Input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="04XX XXX XXX" />
          </Field>
        </div>
        <Button type="button" className="mb-4" onClick={() => send('sms')} disabled={!campaignId || !mobile.trim() || busy !== null} loading={busy === 'sms'}>
          {busy === 'sms' ? 'Sending…' : 'Send test SMS'}
        </Button>
      </div>
      {result && (
        <p role="status" className={`rounded-lg p-3 text-sm ${result.ok ? 'bg-green/15 font-bold text-green-dark' : 'bg-coral/10 font-medium text-coral'}`}>
          {result.text}
        </p>
      )}
    </div>
  );
}
