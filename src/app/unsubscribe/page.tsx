'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SplitLayout, FormCard, LoadingNote } from '@/components/site/layout';
import UnsubscribeChoice, { type UnsubscribeMode } from '@/components/site/UnsubscribeChoice';

// Where the Unsubscribe link in blast emails lands (`/unsubscribe?token=...`),
// and the opt-out link in blast texts (`/optout`, the same page). No log-in
// needed. Gil's question comes first: leave everything like it is, or
// unsubscribe (Q16). Unsubscribing only stops event news and offers; booking
// emails still come (the user, 6 Oct).
//
// The email's link says who it is. The text's link is the same for everyone,
// so it's whoever is signed in on this phone, or else the number they enter.

function UnsubscribeInner() {
  const token = useSearchParams().get('token');
  const [mode, setMode] = useState<UnsubscribeMode | null>(token ? { kind: 'token', token } : null);

  useEffect(() => {
    if (token) { setMode({ kind: 'token', token }); return; }
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => setMode(d?.member ? { kind: 'account' } : { kind: 'mobile' }))
      .catch(() => setMode({ kind: 'mobile' }));
  }, [token]);

  return (
    <SplitLayout title="Unsubscribe">
      <FormCard>{mode ? <UnsubscribeChoice mode={mode} /> : <LoadingNote>One moment…</LoadingNote>}</FormCard>
    </SplitLayout>
  );
}

export default function UnsubscribePage() {
  // useSearchParams requires a Suspense boundary during prerender
  return (
    <Suspense fallback={null}>
      <UnsubscribeInner />
    </Suspense>
  );
}
