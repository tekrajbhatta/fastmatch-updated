'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Field, Input, Select, Loader, BackLink } from '@/components/ui';
import { calculateAge } from '@/lib/age';
import { venueLine } from '@/lib/venue';
import { PAYMENT_METHODS } from '@/lib/paymentMethod';
import { Spinner } from '@/components/Spinner';

interface EventSummary {
  id: string; name: string; startsAt: string; cost: string;
  maxMen: number; maxWomen: number; menBooked: number; womenBooked: number;
  venue: { name: string; address: string | null }; city: { name: string };
}
interface MemberHit {
  id: string; name: string; email: string; mobile: string;
  gender: 'MALE' | 'FEMALE'; dateOfBirth: string; city: { name: string } | null;
}
interface AddResult {
  added: { memberId: string; name: string; badge: number; notified: boolean }[];
  skipped: { memberId: string; name: string | null; reason: string }[];
}

/**
 * "Add a new booking" — books members who are ALREADY registered. Search,
 * tick as many people as needed (the selection survives new searches, so a
 * group can be gathered one name at a time), set how they paid, add them all.
 * Someone who isn't registered yet goes through "Add a new member" instead.
 */
export default function AddBookingPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [bookedIds, setBookedIds] = useState<Set<string>>(new Set());

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<MemberHit[]>([]);
  const [searching, setSearching] = useState(false);
  const latestQuery = useRef('');

  const [selected, setSelected] = useState<MemberHit[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [paidAmount, setPaidAmount] = useState('');
  // On by default (Gil): most people are added at the door.
  const [checkedIn, setCheckedIn] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AddResult | null>(null);

  function loadBooked() {
    fetch(`/api/admin/events/${eventId}/bookings`).then((r) => r.json()).then((rows: { memberId: string }[]) => {
      setBookedIds(new Set(rows.map((b) => b.memberId)));
    });
  }

  useEffect(() => {
    fetch('/api/admin/events').then((r) => r.json()).then((events: EventSummary[]) => {
      const e = events.find((x) => x.id === eventId) ?? null;
      setEvent(e);
      // Same default as the old admin: the ticket price, before any discount.
      if (e) setPaidAmount(String(Number(e.cost)));
    });
    loadBooked();
  }, [eventId]);

  // Debounced search. Anything older than the latest keystroke is dropped
  // when it lands, so a slow early request can't overwrite newer results.
  useEffect(() => {
    const q = query.trim();
    latestQuery.current = q;
    if (q.length < 2) { setHits([]); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/admin/members?search=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data) => {
          if (latestQuery.current !== q) return;
          setHits(Array.isArray(data.members) ? data.members : []);
          setSearching(false);
        })
        .catch(() => { if (latestQuery.current === q) setSearching(false); });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const isSelected = (id: string) => selected.some((m) => m.id === id);
  function toggle(m: MemberHit) {
    setResult(null);
    setSelected((s) => (s.some((x) => x.id === m.id) ? s.filter((x) => x.id !== m.id) : [...s, m]));
  }

  async function handleAdd() {
    setError(null);
    setResult(null);
    setSubmitting(true);
    const res = await fetch(`/api/admin/events/${eventId}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberIds: selected.map((m) => m.id), paymentMethod, paidAmount: Number(paidAmount || 0), checkedIn }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Could not add those bookings.'); return; }

    const r = data as AddResult;
    // Everyone in and everyone emailed: straight to the list, where they now appear.
    if (r.skipped.length === 0 && r.added.every((a) => a.notified)) {
      router.push(`/admin/events/${eventId}/bookings`);
      return;
    }
    // Otherwise stay, say exactly what happened, and keep only the people who
    // weren't added selected, so the admin can deal with them.
    setResult(r);
    const addedIds = new Set(r.added.map((a) => a.memberId));
    setSelected((s) => s.filter((m) => !addedIds.has(m.id)));
    loadBooked();
  }

  if (!event) return <Loader />;

  const date = new Date(event.startsAt);
  const selMen = selected.filter((m) => m.gender === 'MALE').length;
  const selWomen = selected.length - selMen;

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href={`/admin/events/${eventId}`}>Back to event</BackLink>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Add a new booking</h1>
      <p className="mb-1 text-sm text-ink/60">
        {event.name} · {venueLine(event.venue)}, {event.city.name} ·{' '}
        {date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })},{' '}
        {date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
      </p>
      <p className="mb-6 text-sm text-ink/50">
        Booked so far: {event.menBooked}/{event.maxMen} men · {event.womenBooked}/{event.maxWomen} women
      </p>

      <Card className="mb-4">
        <Field label="Find registered members">
          <Input
            autoFocus
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email or mobile"
          />
        </Field>

        {query.trim().length > 0 && query.trim().length < 2 && (
          <p className="text-sm text-ink/50">Keep typing…</p>
        )}
        {searching && <p role="status" className="flex items-center gap-2 text-sm text-ink/50"><Spinner className="h-4 w-4 text-plum" />Searching…</p>}

        {!searching && query.trim().length >= 2 && hits.length === 0 && (
          <div className="rounded-lg bg-cream/60 p-3 text-sm">
            <p className="font-bold text-ink">The member is not registered yet.</p>
            <p className="mt-1 text-ink/60">
              Nobody matches &ldquo;{query.trim()}&rdquo;.{' '}
              <Link href={`/admin/events/${eventId}/members/new`} className="font-bold text-plum hover:underline">
                Add them as a new member
              </Link>{' '}
              to register and book them in one step.
            </p>
          </div>
        )}

        {!searching && hits.length > 0 && (
          <ul className="max-h-80 divide-y divide-ink/5 overflow-y-auto rounded-lg border border-ink/10">
            {hits.map((m) => {
              const already = bookedIds.has(m.id);
              return (
                <li key={m.id}>
                  <label className={`flex items-center gap-3 px-3 py-2.5 text-sm ${already ? 'cursor-not-allowed bg-ink/5 opacity-60' : 'cursor-pointer hover:bg-cream/40'}`}>
                    <input type="checkbox" disabled={already} checked={already || isSelected(m.id)} onChange={() => toggle(m)} />
                    <span className="min-w-0 flex-1">
                      <span className="font-bold text-ink">{m.name}</span>
                      <span className="ml-2 text-ink/50">
                        {m.gender === 'MALE' ? 'M' : 'F'} · {calculateAge(new Date(m.dateOfBirth))}
                        {m.city ? ` · ${m.city.name}` : ''}
                      </span>
                      <span className="block truncate text-xs text-ink/50">{m.email} · {m.mobile}</span>
                    </span>
                    {already && <span className="text-xs font-bold text-ink/50">Already booked</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 font-extrabold text-ink">
          Selected{selected.length > 0 && <span className="font-semibold text-ink/50">: {selected.length} ({selMen} {selMen === 1 ? 'man' : 'men'}, {selWomen} {selWomen === 1 ? 'woman' : 'women'})</span>}
        </h2>
        {selected.length === 0 ? (
          <p className="mb-4 text-sm text-ink/40">Nobody yet. Tick members in the search results above.</p>
        ) : (
          <div className="mb-4 flex flex-wrap gap-2">
            {selected.map((m) => (
              <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-plum/10 py-1 pl-3 pr-1.5 text-sm font-bold text-plum">
                {m.name}
                <button type="button" onClick={() => toggle(m)} aria-label={`Remove ${m.name}`} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-plum/20">×</button>
              </span>
            ))}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Payment status">
            <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label="Paid ($)">
            <Input type="number" step="0.01" min="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
          </Field>
        </div>
        {paymentMethod === 'CARD' && (
          <p className="mb-4 rounded-lg bg-cream/60 p-3 text-xs text-ink/70">
            Card details aren&apos;t taken on this screen. Charge the card separately (e.g. in Stripe), then add the booking here.
          </p>
        )}
        <label className="mb-4 flex items-start gap-2 text-sm font-semibold text-ink">
          <input type="checkbox" className="mt-0.5" checked={checkedIn} onChange={(e) => setCheckedIn(e.target.checked)} />
          <span>
            Checked in
            <span className="block text-xs font-normal text-ink/50">Untick if you&apos;re booking them in ahead of the night.</span>
          </span>
        </label>
        <p className="mb-4 text-xs text-ink/50">
          Applies to everyone selected. Each person is booked in as paid, emailed a booking confirmation, and can be
          adjusted individually on the bookings page afterwards.
        </p>

        {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}
        <Button onClick={handleAdd} disabled={submitting || selected.length === 0} loading={submitting} className="w-full">
          {submitting ? 'Adding…' : selected.length <= 1 ? 'Add booking' : `Add ${selected.length} bookings`}
        </Button>
      </Card>

      {result && (
        <Card className="mb-4">
          {result.added.length > 0 && (
            <div className="mb-3">
              <p className="font-bold text-green-dark">Added {result.added.length}:</p>
              <ul className="mt-1 list-inside list-disc text-sm text-ink/70">
                {result.added.map((a) => (
                  <li key={a.memberId}>
                    {a.name} (badge #{a.badge})
                    {!a.notified && <span className="text-coral">: confirmation email couldn&apos;t be sent, so let them know directly</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.skipped.length > 0 && (
            <div className="mb-3">
              <p className="font-bold text-coral">Not added {result.skipped.length}:</p>
              <ul className="mt-1 list-inside list-disc text-sm text-ink/70">
                {result.skipped.map((s) => <li key={s.memberId}>{s.name ?? 'Unknown member'}: {s.reason}</li>)}
              </ul>
            </div>
          )}
          <Link href={`/admin/events/${eventId}/bookings`} className="text-sm font-bold text-plum hover:underline">View bookings →</Link>
        </Card>
      )}
    </div>
  );
}
