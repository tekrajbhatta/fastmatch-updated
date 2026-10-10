'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button, Field, Input, Select, Loader, BackLink, Badge } from '@/components/ui';
import { calculateAge } from '@/lib/age';
import { PAYMENT_METHODS, paymentMethodLabel, bookingStatusLabel } from '@/lib/paymentMethod';
import { formatPrice } from '@/lib/price';
import { hasStripePayment } from '@/lib/stripePayment';
import { countOf } from '@/lib/plural';
import { checkInState } from '@/lib/eventNight';
import { NETWORK_ERROR } from '@/lib/networkError';
import { useIsPhone } from '@/lib/useMediaQuery';

interface Booking {
  id: string; badge: number; status: string; paidAmount: string; checkedIn: boolean;
  paymentMethod: string | null;
  stripePaymentIntentId: string | null;
  confirmedAt: string | null;
  // The member who brought them, and how that member paid (for a friend's place).
  bookedBy: { paymentMethod: string | null; stripePaymentIntentId: string | null; confirmedAt: string | null; member: { name: string } } | null;
  pendingFriends: { name: string }[] | null;
  member: { name: string; email: string; mobile: string; gender: string; dateOfBirth: string };
}

export default function EventBookingsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [bookings, setBookings] = useState<Booking[]>([]);
  // False until the first fetch returns, so the list doesn't claim to be empty while loading.
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Inline edit of one booking at a time — the host is standing at a door,
  // not filling in a form, so this opens in place rather than on another page.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ status: 'PENDING', paidAmount: '', checkedIn: false, paymentMethod: '' });
  // The status the booking had when the editor opened: the save is refused
  // if it has changed since (a card payment coming through, say).
  const [editFrom, setEditFrom] = useState<string | null>(null);
  const [savingBooking, setSavingBooking] = useState(false);
  // Something to know about a save that worked (e.g. they'd just paid online).
  const [notice, setNotice] = useState<string | null>(null);
  // The card payment in Stripe behind the booking being edited, looked up
  // when its Edit row opens (the booking keeps only its payment page's id).
  // The event itself, for the night's check-in window (the "Check in" buttons).
  const [event, setEvent] = useState<{ startsAt: string; status: string; city: { name: string } | null } | null>(null);
  // The booking a "Check in" button is saving.
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const phone = useIsPhone();
  // "Find a name or number": narrows the list as the host types, at the door.
  const [find, setFind] = useState('');
  // Redraws once a minute, so "Check in" appears when check-in opens without a reload.
  const [, setMinute] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMinute((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);
  const [stripePayment, setStripePayment] = useState<
    { state: 'loading' } | { state: 'none'; reason: string } | { state: 'failed' } | { state: 'found'; reference: string; url: string; paidBy: string | null } | null
  >(null);

  function loadBookings() {
    // A failed refresh (no signal at the venue, say) keeps the list that's showing.
    fetch(`/api/admin/events/${eventId}/bookings`).then((r) => r.json()).then((d) => { if (Array.isArray(d)) { setBookings(d); setLoaded(true); } }).catch(() => {});
  }

  useEffect(() => {
    loadBookings();
    fetch(`/api/admin/events/${eventId}`).then((r) => (r.ok ? r.json() : null)).then((e) => e && setEvent(e)).catch(() => {});
  }, [eventId]);

  function startEdit(b: Booking) {
    setError(null);
    setEditingId(b.id);
    setEdit({ status: b.status, paidAmount: String(b.paidAmount), checkedIn: b.checkedIn, paymentMethod: b.paymentMethod ?? '' });
    setEditFrom(b.status);
    setStripePayment(null);
    if (hasStripePayment(b)) {
      setStripePayment({ state: 'loading' });
      fetch(`/api/admin/bookings/${b.id}/stripe`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d) => setStripePayment(d.payment ? { state: 'found', ...d.payment } : { state: 'none', reason: d.reason ?? '' }))
        .catch(() => setStripePayment({ state: 'failed' }));
    }
  }

  async function saveBooking(id: string) {
    setError(null);
    setNotice(null);
    setSavingBooking(true);
    const res = await fetch(`/api/admin/bookings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...edit, paidAmount: Number(edit.paidAmount || 0), paymentMethod: edit.paymentMethod || null, expectedStatus: editFrom }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingBooking(false);
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Could not save that booking.');
      // Changed since it was opened: show it as it is now.
      if (data.changed) { setEditingId(null); loadBookings(); }
      return;
    }
    setEditingId(null);
    if (typeof data.notice === 'string') setNotice(data.notice);
    loadBookings();
  }

  // One tap at the door, during the night only (an hour before the start
  // until midnight, as for members): the same save as Edit with "Checked in"
  // ticked, the rest of the booking left as it is.
  async function checkIn(b: Booking) {
    setError(null);
    setNotice(null);
    setCheckingIn(b.id);
    const res = await fetch(`/api/admin/bookings/${b.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: b.status, paidAmount: Number(b.paidAmount || 0), checkedIn: true, expectedStatus: b.status }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setCheckingIn(null);
    if (!res) { setError(NETWORK_ERROR); return; }
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Could not check them in.');
      if (data.changed) loadBookings();
      return;
    }
    loadBookings();
  }
  const nightOpen = !!event && event.status !== 'CANCELLED' && checkInState(event) === 'open';
  const canCheckIn = (b: Booking) => nightOpen && b.status === 'CONFIRMED' && !b.checkedIn;

  // During the night the list keeps itself up to date (every 20 seconds), so
  // members checking in on their phones show up without a reload. Not while a
  // booking is being edited, or while the page is in the background.
  useEffect(() => {
    if (!nightOpen || editingId) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadBookings(); }, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nightOpen, editingId, eventId]);

  // Paid places only, matching the events list. (An unpaid online booking
  // also holds its places for the first 10 minutes of its payment page.)
  const paid = bookings.filter((b) => b.status === 'CONFIRMED');
  const men = paid.filter((b) => b.member.gender === 'MALE').length;
  const women = paid.filter((b) => b.member.gender === 'FEMALE').length;
  const unpaid = bookings.filter((b) => b.status === 'PENDING').length;
  const checkedInCount = paid.filter((b) => b.checkedIn).length;
  // Name, number, email or mobile (digits only, so spaces don't matter).
  const q = find.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  const shown = !q ? bookings : bookings.filter((b) =>
    b.member.name.toLowerCase().includes(q)
    || b.member.email.toLowerCase().includes(q)
    || (/^\d+$/.test(q) && (String(b.badge) === String(Number(q)) || b.member.mobile.replace(/\D/g, '').includes(qDigits))));

  // Tap to email or call (on a phone, straight from the door).
  const contact = (b: Booking) => (
    <>
      <a href={`mailto:${b.member.email}`} className="hover:underline">{b.member.email}</a>
      {' · '}
      <a href={`tel:${b.member.mobile.replace(/\s+/g, '')}`} className="whitespace-nowrap hover:underline">{b.member.mobile}</a>
    </>
  );

  const statusDetails = (b: Booking, showCheckedIn: boolean) => (
    <>
      {bookingStatusLabel(b.status, formatPrice(b.paidAmount))}
      <span className="ml-1 text-xs text-ink/50">· {paymentMethodLabel(b.paymentMethod)}</span>
      {showCheckedIn && b.checkedIn && <span className="ml-2 text-xs font-bold text-green-dark">checked in</span>}
      {/* The card payment in Stripe (a friend's is the member's who brought them). */}
      {hasStripePayment(b) && (
        <a href={`/api/admin/bookings/${b.id}/stripe?open=1`} target="_blank" rel="noopener noreferrer" className="ml-2 whitespace-nowrap text-xs font-bold text-plum hover:underline">
          View in Stripe
        </a>
      )}
      {/* Unpaid: their friends aren't booked yet, and appear as
          their own rows once the payment goes through. */}
      {b.status === 'PENDING' && b.pendingFriends?.length ? (
        <span className="block text-xs text-ink/50">
          + {b.pendingFriends.length} friend{b.pendingFriends.length === 1 ? '' : 's'} awaiting payment ({b.pendingFriends.map((f) => f.name).join(', ')})
        </span>
      ) : null}
    </>
  );

  // One booking's corrections. Side by side on a computer; two to a row on a phone.
  const editForm = (b: Booking) => (
    <>
      <div className="grid grid-cols-2 gap-x-3 md:flex md:flex-wrap md:items-end md:gap-3">
        <div className="md:w-40">
          <Field label="Status">
            <Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
              <option value="PENDING">Pending</option>
              <option value="CONFIRMED">Paid</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="REFUNDED">Cancelled – refunded</option>
            </Select>
          </Field>
        </div>
        <div className="md:w-44">
          <Field label="Payment">
            <Select value={edit.paymentMethod} onChange={(e) => setEdit({ ...edit, paymentMethod: e.target.value })}>
              <option value="">Online</option>
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </Field>
        </div>
        <div className="md:w-32">
          <Field label="Amount ($)">
            <Input type="number" inputMode="decimal" step="0.01" value={edit.paidAmount}
              onChange={(e) => setEdit({ ...edit, paidAmount: e.target.value })} />
          </Field>
        </div>
        <label className="mb-4 flex min-h-[44px] items-center gap-2 text-sm font-semibold text-ink md:min-h-0">
          <input type="checkbox" className="h-5 w-5 md:h-auto md:w-auto" checked={edit.checkedIn}
            onChange={(e) => setEdit({ ...edit, checkedIn: e.target.checked })} />
          Checked in
        </label>
        <div className="col-span-2 mb-4 flex gap-2">
          <Button onClick={() => saveBooking(b.id)} disabled={savingBooking} loading={savingBooking} className="flex-1 md:flex-none">
            {savingBooking ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="ghost" onClick={() => { setEditingId(null); setError(null); }} className="flex-1 md:flex-none">Cancel</Button>
        </div>
      </div>
      {/* Marking Paid here records that money changed hands, e.g.
          cash at the door. It does not charge a card, and
          Refunded does not send money back — both still happen
          in Stripe. */}
      <p className="text-xs text-ink/50">
        Records what happened. It doesn&apos;t take or refund a payment in Stripe.
      </p>
      {stripePayment && (
        <p className="mt-1 text-xs text-ink/60">
          {stripePayment.state === 'loading' && 'Looking up the payment in Stripe…'}
          {stripePayment.state === 'failed' && 'Couldn’t look up the payment in Stripe just now.'}
          {stripePayment.state === 'none' && stripePayment.reason}
          {stripePayment.state === 'found' && (
            <>
              {stripePayment.paidBy ? `Paid as part of ${stripePayment.paidBy}’s card payment: ` : 'Card payment in Stripe: '}
              <span className="break-all font-mono font-bold text-ink">{stripePayment.reference}</span>
              {' · '}
              <a href={stripePayment.url} target="_blank" rel="noopener noreferrer" className="font-bold text-plum hover:underline">View in Stripe</a>
            </>
          )}
        </p>
      )}
    </>
  );

  return (
    <div>
      <BackLink href={`/admin/events/${eventId}`}>Back to event</BackLink>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Event bookings</h1>
      <p className="mb-4 text-sm text-ink/60">
        {loaded ? `${countOf(men, 'man', 'men')} · ${countOf(women, 'woman', 'women')} booked` : 'Loading bookings…'}
        {loaded && checkedInCount > 0 && <span> · {checkedInCount} checked in</span>}
        {unpaid > 0 && <span className="text-ink/40"> · {unpaid} unpaid ({unpaid === 1 ? 'it holds' : 'each holds'} its places for 10 minutes while its payment page is open)</span>}
      </p>

      {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}
      {notice && <p role="status" className="mb-4 text-sm font-medium text-ink">{notice}</p>}

      {loaded && bookings.length > 0 && (
        <div className="mb-4 max-w-sm">
          <Input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a name or number" aria-label="Find a name or number" />
        </div>
      )}
      {loaded && q && shown.length === 0 && <p className="mb-4 text-sm text-ink/50">No booking matches “{find.trim()}”.</p>}

      {phone ? (
        // A phone: one card per booking, everything in view, big buttons.
        <div className="space-y-3">
          {!loaded && <Loader label="Loading bookings…" />}
          {loaded && bookings.length === 0 && <p className="text-sm text-ink/50">No bookings yet.</p>}
          {shown.map((b) => (
            <div key={b.id} className="rounded-xl border border-ink/10 bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="pt-0.5 font-mono text-sm text-ink/40">{String(b.badge).padStart(2, '0')}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-ink">{b.member.name}</div>
                  <div className="text-xs text-ink/50">
                    {b.member.gender === 'MALE' ? 'M' : 'F'} · {calculateAge(new Date(b.member.dateOfBirth))}
                    {b.bookedBy && <> · Friend of {b.bookedBy.member.name}</>}
                  </div>
                </div>
                {b.checkedIn && <Badge>Checked in</Badge>}
              </div>
              <div className="mt-2 break-words text-sm text-ink/60">{contact(b)}</div>
              <div className="mt-2 text-sm">{statusDetails(b, false)}</div>
              {editingId === b.id ? (
                <div className="mt-3 border-t border-ink/10 pt-3">{editForm(b)}</div>
              ) : (
                <div className="mt-3 flex gap-2">
                  {canCheckIn(b) && (
                    <Button onClick={() => checkIn(b)} disabled={checkingIn === b.id} loading={checkingIn === b.id} className="flex-1">
                      {checkingIn === b.id ? 'Checking in…' : 'Check in'}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => startEdit(b)} className="flex-1">Edit</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
      <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-left text-xs font-bold uppercase text-ink/50">
            <tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">M/F</th><th className="px-4 py-3">Age</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {!loaded && <tr><td colSpan={7}><Loader label="Loading bookings…" /></td></tr>}
            {loaded && bookings.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-ink/50">No bookings yet.</td></tr>}
            {shown.flatMap((b) => [
              <tr key={b.id} className="border-t border-ink/5">
                <td className="px-4 py-3 text-ink/40">{String(b.badge).padStart(2, '0')}</td>
                <td className="px-4 py-3 font-bold text-ink">
                  {b.member.name}
                  {b.bookedBy && <span className="block text-xs font-normal text-ink/50">Friend of {b.bookedBy.member.name}</span>}
                </td>
                <td className="px-4 py-3 text-ink/60">{b.member.gender === 'MALE' ? 'M' : 'F'}</td>
                <td className="px-4 py-3 text-ink/60">{calculateAge(new Date(b.member.dateOfBirth))}</td>
                <td className="px-4 py-3 text-ink/60">{contact(b)}</td>
                <td className="px-4 py-3">{statusDetails(b, true)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {canCheckIn(b) && (
                    <Button onClick={() => checkIn(b)} disabled={checkingIn === b.id} loading={checkingIn === b.id} className="mr-3 !px-3 !py-1.5">
                      {checkingIn === b.id ? 'Checking in…' : 'Check in'}
                    </Button>
                  )}
                  <button onClick={() => startEdit(b)} className="text-sm font-bold text-plum hover:underline">Edit</button>
                </td>
              </tr>,
              editingId === b.id ? (
                <tr key={`${b.id}-edit`} className="border-t border-ink/5 bg-cream/40">
                  <td colSpan={7} className="px-4 py-4">{editForm(b)}</td>
                </tr>
              ) : null,
            ])}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
