'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import { calculateAge } from '@/lib/age';

interface Booking {
  id: string; badge: number; status: string; paidAmount: string; checkedIn: boolean;
  member: { name: string; email: string; mobile: string; gender: string; dateOfBirth: string };
}
interface City { id: string; name: string; }

export default function EventBookingsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const [newMember, setNewMember] = useState({ name: '', gender: 'MALE', email: '', cityId: '', dateOfBirth: '', mobile: '' });
  const [error, setError] = useState<string | null>(null);
  // Inline edit of one booking at a time — the host is standing at a door,
  // not filling in a form, so this opens in place rather than on another page.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ status: 'PENDING', paidAmount: '', checkedIn: false });
  const [savingBooking, setSavingBooking] = useState(false);

  function loadBookings() {
    fetch(`/api/admin/events/${eventId}/bookings`).then((r) => r.json()).then(setBookings);
  }

  useEffect(() => {
    loadBookings();
    fetch('/api/cities').then((r) => r.json()).then((data) => {
      setCities(data);
      if (data.length) setNewMember((m) => ({ ...m, cityId: data[0].id }));
    });
  }, [eventId]);

  function startEdit(b: Booking) {
    setError(null);
    setEditingId(b.id);
    setEdit({ status: b.status, paidAmount: String(b.paidAmount), checkedIn: b.checkedIn });
  }

  async function saveBooking(id: string) {
    setError(null);
    setSavingBooking(true);
    const res = await fetch(`/api/admin/bookings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...edit, paidAmount: Number(edit.paidAmount || 0) }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingBooking(false);
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Could not save that booking.');
      return;
    }
    setEditingId(null);
    loadBookings();
  }

  async function handleAddWalkIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const memberRes = await fetch('/api/admin/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMember),
    });
    const member = await memberRes.json();
    if (!memberRes.ok) {
      setError(member.error ?? 'Could not add member.');
      return;
    }
    const bookingRes = await fetch(`/api/admin/events/${eventId}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member.id, markAsPaidCash: true }),
    });
    if (!bookingRes.ok) {
      const data = await bookingRes.json();
      setError(data.error ?? 'Could not add booking.');
      return;
    }
    setShowAddMember(false);
    setNewMember({ name: '', gender: 'MALE', email: '', cityId: cities[0]?.id ?? '', dateOfBirth: '', mobile: '' });
    loadBookings();
  }

  const men = bookings.filter((b) => b.member.gender === 'MALE').length;
  const women = bookings.filter((b) => b.member.gender === 'FEMALE').length;

  return (
    <div>
      <Link href={`/admin/events/${eventId}`} className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-plum hover:underline">
        ← Back to event
      </Link>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Event bookings</h1>
      <p className="mb-4 text-sm text-ink/60">{men} men · {women} women booked</p>

      <Button onClick={() => setShowAddMember(!showAddMember)} className="mb-4">+ Add walk-in</Button>

      {showAddMember && (
        <Card className="mb-4">
          <form onSubmit={handleAddWalkIn}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name"><Input required value={newMember.name} onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} /></Field>
              <Field label="Gender">
                <Select value={newMember.gender} onChange={(e) => setNewMember({ ...newMember, gender: e.target.value })}>
                  <option value="MALE">Male</option><option value="FEMALE">Female</option>
                </Select>
              </Field>
              <Field label="Email"><Input type="email" required value={newMember.email} onChange={(e) => setNewMember({ ...newMember, email: e.target.value })} /></Field>
              <Field label="City">
                <Select value={newMember.cityId} onChange={(e) => setNewMember({ ...newMember, cityId: e.target.value })}>
                  {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Date of birth"><Input type="date" required value={newMember.dateOfBirth} onChange={(e) => setNewMember({ ...newMember, dateOfBirth: e.target.value })} /></Field>
              <Field label="Mobile"><Input required value={newMember.mobile} onChange={(e) => setNewMember({ ...newMember, mobile: e.target.value })} /></Field>
            </div>
            {error && <p className="mb-3 text-sm font-medium text-coral">{error}</p>}
            <Button type="submit" className="w-full">Add &amp; check in — cash paid</Button>
          </form>
        </Card>
      )}

      <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-left text-xs font-bold uppercase text-ink/50">
            <tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">M/F</th><th className="px-4 py-3">Age</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {bookings.flatMap((b) => [
              <tr key={b.id} className="border-t border-ink/5">
                <td className="px-4 py-3 text-ink/40">{String(b.badge).padStart(2, '0')}</td>
                <td className="px-4 py-3 font-bold text-ink">{b.member.name}</td>
                <td className="px-4 py-3 text-ink/60">{b.member.gender === 'MALE' ? 'M' : 'F'}</td>
                <td className="px-4 py-3 text-ink/60">{calculateAge(new Date(b.member.dateOfBirth))}</td>
                <td className="px-4 py-3 text-ink/60">{b.member.email} · {b.member.mobile}</td>
                <td className="px-4 py-3">
                  {b.status === 'CONFIRMED' ? `Paid $${b.paidAmount}` : b.status}
                  {b.checkedIn && <span className="ml-2 text-xs font-bold text-green-dark">checked in</span>}
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
                            <option value="REFUNDED">Refunded</option>
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
                        <Button onClick={() => saveBooking(b.id)} disabled={savingBooking}>
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
                      Records what happened — it doesn&apos;t take or refund a payment in Stripe.
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
