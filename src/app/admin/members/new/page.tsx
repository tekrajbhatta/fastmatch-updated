'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, BackLink } from '@/components/ui';
import NewMemberFields, { BLANK_NEW_MEMBER, type NewMemberForm } from '@/components/NewMemberFields';

/**
 * The Members page's "Add member" (Gil, Q30: "you should be able to add
 * members even if they don't join an event"). Same details as an event's
 * "Add a new member", without the booking. They're emailed that they've been
 * registered, with a link to log in or choose their own password.
 */
export default function AddMemberPage() {
  const router = useRouter();
  const [cities, setCities] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState<NewMemberForm>(BLANK_NEW_MEMBER);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ id: string; name: string; missed: string[] } | null>(null);

  useEffect(() => {
    fetch('/api/cities').then((r) => r.json()).then(setCities);
  }, []);

  const set = (patch: Partial<NewMemberForm>) => setForm((f) => ({ ...f, ...patch }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch('/api/admin/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Please check the member details.'); return; }
    // The member IS saved; anything that couldn't be sent is for following up by hand.
    const n = data.notified ?? {};
    const missed = [
      n.registeredEmail === false && 'the "You’ve been registered" email',
      n.verificationEmail === false && 'the email confirmation link',
      n.verificationSms === false && 'the mobile confirmation code',
    ].filter(Boolean) as string[];
    if (missed.length === 0) { router.push(`/admin/members/${data.member.id}`); return; }
    setAdded({ id: data.member.id, name: data.member.name, missed });
  }

  if (added) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="mb-4 text-2xl font-extrabold text-ink">Member added</h1>
        <Card className="mb-4">
          {added.missed.map((m) => <p key={m} className="mb-2 text-sm text-ink/70">{added.name} was added, but {m} couldn&apos;t be sent.</p>)}
          <p className="text-sm text-ink/50">Please contact them directly.</p>
        </Card>
        <Link href={`/admin/members/${added.id}`} className="text-sm font-bold text-plum hover:underline">View {added.name} →</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <BackLink href="/admin/members">Back to members</BackLink>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Add member</h1>
      <p className="mb-6 text-sm text-ink/60">
        Registers someone without booking them into an event (to add them to an event, use its &ldquo;Add a new member&rdquo;).
        They&apos;re emailed that they&apos;ve been registered, with a link to log in or choose their own password.
      </p>
      <form onSubmit={handleSubmit}>
        <NewMemberFields form={form} set={set} cities={cities} />
        {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}
        <Button type="submit" disabled={saving} loading={saving} className="w-full">{saving ? 'Saving…' : 'Create member'}</Button>
      </form>
    </div>
  );
}
