'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button, Field, Input, Select, Loader, BackLink } from '@/components/ui';
import { calculateAge } from '@/lib/age';
import { PAYMENT_METHODS, paymentMethodLabel, bookingStatusLabel } from '@/lib/paymentMethod';
import { formatPrice } from '@/lib/price';

interface Booking {
  id: string; badge: number; status: string; paidAmount: string; checkedIn: boolean;
  paymentMethod: string | null;
  bookedBy: { member: { name: string } } | null;
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
  const [savingBooking, setSavingBooking] = useState(false);
  // Something to know about a save that worked (e.g. they'd just paid online).
  const [notice, setNotice] = useState<string | null>(null);

  function loadBookings() {
    fetch(`/api/admin/events/${eventId}/bookings`).then((r) => r.json()).then((d) => { setBookings(d); setLoaded(true); });
  }

  useEffect(() => {
    loadBookings();
  }, [eventId]);

  function startEdit(b: Booking) {
    setError(null);
    setEditingId(b.id);
    setEdit({ status: b.status, paidAmount: String(b.paidAmount), checkedIn: b.checkedIn, paymentMethod: b.paymentMethod ?? '' });
  }

  async function saveBooking(id: string) {
    setError(null);
    setNotice(null);
    setSavingBooking(true);
    const res = await fetch(`/api/admin/bookings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...edit, paidAmount: Number(edit.paidAmount || 0), paymentMethod: edit.paymentMethod || null }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingBooking(false);
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Could not save that booking.');
      return;
    }
    setEditingId(null);
    if (typeof data.notice === 'string') setNotice(data.notice);
    loadBookings();
  }

  // Paid places only, matching the events list. (An unpaid online booking
  // also holds its places for the first 10 minutes of its payment page.)
  const paid = bookings.filter((b) => b.status === 'CONFIRMED');
  const men = paid.filter((b) => b.member.gender === 'MALE').length;
  const women = paid.filter((b) => b.member.gender === 'FEMALE').length;
  const unpaid = bookings.filter((b) => b.status === 'PENDING').length;

  return (
    <div>
      <BackLink href={`/admin/events/${eventId}`}>Back to event</BackLink>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Event bookings</h1>
      <p className="mb-4 text-sm text-ink/60">
        {loaded ? `${men} men · ${women} women booked` : 'Loading bookings…'}
        {unpaid > 0 && <span className="text-ink/40"> · {unpaid} unpaid (each holds its places for 10 minutes while its payment page is open)</span>}
      </p>

      {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}
      {notice && <p role="status" className="mb-4 text-sm font-medium text-ink">{notice}</p>}

      <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-left text-xs font-bold uppercase text-ink/50">
            <tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">M/F</th><th className="px-4 py-3">Age</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {!loaded && <tr><td colSpan={7}><Loader label="Loading bookings…" /></td></tr>}
            {bookings.flatMap((b) => [
              <tr key={b.id} className="border-t border-ink/5">
                <td className="px-4 py-3 text-ink/40">{String(b.badge).padStart(2, '0')}</td>
                <td className="px-4 py-3 font-bold text-ink">
                  {b.member.name}
                  {b.bookedBy && <span className="block text-xs font-normal text-ink/50">Friend of {b.bookedBy.member.name}</span>}
                </td>
                <td className="px-4 py-3 text-ink/60">{b.member.gender === 'MALE' ? 'M' : 'F'}</td>
                <td className="px-4 py-3 text-ink/60">{calculateAge(new Date(b.member.dateOfBirth))}</td>
                <td className="px-4 py-3 text-ink/60">{b.member.email} · {b.member.mobile}</td>
                <td className="px-4 py-3">
                  {bookingStatusLabel(b.status, formatPrice(b.paidAmount))}
                  <span className="ml-1 text-xs text-ink/50">· {paymentMethodLabel(b.paymentMethod)}</span>
                  {b.checkedIn && <span className="ml-2 text-xs font-bold text-green-dark">checked in</span>}
                  {/* Unpaid: their friends aren't booked yet, and appear as
                      their own rows once the payment goes through. */}
                  {b.status === 'PENDING' && b.pendingFriends?.length ? (
                    <span className="block text-xs text-ink/50">
                      + {b.pendingFriends.length} friend{b.pendingFriends.length === 1 ? '' : 's'} awaiting payment ({b.pendingFriends.map((f) => f.name).join(', ')})
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => startEdit(b)} className="text-sm font-bold text-plum hover:underline">Edit</button>
                </td>
              </tr>,
              editingId === b.id ? (
                <tr key={`${b.id}-edit`} className="border-t border-ink/5 bg-cream/40">
                  <td colSpan={7} className="px-4 py-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="w-40">
                        <Field label="Status">
                          <Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                            <option value="PENDING">Pending</option>
                            <option value="CONFIRMED">Paid</option>
                            <option value="CANCELLED">Cancelled</option>
                            <option value="REFUNDED">Cancelled – refunded</option>
                          </Select>
                        </Field>
                      </div>
                      <div className="w-44">
                        <Field label="Payment">
                          <Select value={edit.paymentMethod} onChange={(e) => setEdit({ ...edit, paymentMethod: e.target.value })}>
                            <option value="">Online</option>
                            {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                          </Select>
                        </Field>
                      </div>
                      <div className="w-32">
                        <Field label="Amount ($)">
                          <Input type="number" step="0.01" value={edit.paidAmount}
                            onChange={(e) => setEdit({ ...edit, paidAmount: e.target.value })} />
                        </Field>
                      </div>
                      <label className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
                        <input type="checkbox" checked={edit.checkedIn}
                          onChange={(e) => setEdit({ ...edit, checkedIn: e.target.checked })} />
                        Checked in
                      </label>
                      <div className="mb-4 flex gap-2">
                        <Button onClick={() => saveBooking(b.id)} disabled={savingBooking} loading={savingBooking}>
                          {savingBooking ? 'Saving…' : 'Save'}
                        </Button>
                        <Button variant="ghost" onClick={() => { setEditingId(null); setError(null); }}>Cancel</Button>
                      </div>
                    </div>
                    {/* Marking Paid here records that money changed hands, e.g.
                        cash at the door. It does not charge a card, and
                        Refunded does not send money back — both still happen
                        in Stripe. */}
                    <p className="text-xs text-ink/50">
                      Records what happened. It doesn&apos;t take or refund a payment in Stripe.
                    </p>
                  </td>
                </tr>
              ) : null,
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}
