'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Field, Input, Button, Card, Loader, BackLink } from '@/components/ui';
import BlastFields, { blastContentFrom, type BlastContent } from '@/components/BlastFields';

export default function EditBlastPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState<BlastContent | null>(null);
  const [hasBeenSent, setHasBeenSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/campaigns/${id}`).then((r) => r.json()).then((c) => {
      setTitle(c.title);
      setContent(blastContentFrom(c));
      setHasBeenSent(!!c.hasBeenSent);
    });
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!content) return;
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/admin/campaigns/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, ...content }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Please check the blast details.'); return; }
    router.push(`/admin/blasts/${id}`);
  }

  if (!content) return <Loader label="Loading blast…" />;

  return (
    <div className="mx-auto max-w-lg">
      <BackLink href={`/admin/blasts/${id}`}>Back to blast</BackLink>
      <h1 className="mb-6 text-2xl font-extrabold text-ink">Edit blast</h1>
      {hasBeenSent && (
        <p className="mb-4 rounded-lg bg-cream/60 p-3 text-sm text-ink/70">
          This blast has been sent before. Your changes apply to its next send. To keep this version as it is, use Duplicate instead.
        </p>
      )}
      <Card>
        <form onSubmit={handleSave}>
          <Field label="Title"><Input required value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <BlastFields value={content} onChange={(patch) => setContent((c) => (c ? { ...c, ...patch } : c))} />
          {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}
          <Button type="submit" disabled={saving || (!content.sendEmail && !content.sendSms)} loading={saving} className="w-full">{saving ? 'Saving…' : 'Save changes'}</Button>
          {!content.sendEmail && !content.sendSms && <p className="mt-2 text-center text-xs text-ink/50">Tick Send Email and/or Send SMS.</p>}
        </form>
      </Card>
    </div>
  );
}
