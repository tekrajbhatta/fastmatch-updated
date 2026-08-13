'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card } from '@/components/ui';

interface Me { id: string; name: string; email: string; agreedTerms: boolean; }

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((data) => setMe(data.member));
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  async function acceptTerms() {
    await fetch('/api/account/accept-terms', { method: 'POST' });
    setMe((m) => (m ? { ...m, agreedTerms: true } : m));
  }

  if (!me) return <p className="text-sm text-ink/50">Please <Link href="/login" className="font-bold text-plum">log in</Link>.</p>;

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-2xl font-extrabold text-ink">My account</h1>
      <p className="mb-6 text-sm text-ink/60">{me.name} · {me.email}</p>

      {!me.agreedTerms && (
        <div className="mb-4 rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm">
          <p className="mb-2 font-bold text-ink">Please accept our Terms &amp; Conditions to book events.</p>
          <Button onClick={acceptTerms} className="w-full">I agree to the Terms &amp; Privacy Policy</Button>
        </div>
      )}

      <Card className="mb-4 divide-y divide-ink/5">
        <AccountLink href="/account/edit-profile" label="Edit profile" />
        <AccountLink href="/account/change-password" label="Change password" />
        <AccountLink href="/contact" label="Contact us" />
        <AccountLink href="/privacy" label="Privacy policy" />
        <AccountLink href="/terms" label="Terms & conditions" />
        <AccountLink href="/account/unsubscribe" label="Unsubscribe from emails" />
      </Card>

      <Button variant="ghost" onClick={handleLogout} className="w-full">Log out</Button>
    </div>
  );
}

function AccountLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="block py-3 text-sm font-bold text-ink hover:text-plum">{label}</Link>
  );
}
