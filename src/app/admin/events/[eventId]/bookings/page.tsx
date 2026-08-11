'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Field, Input, Select } from '@/components/ui';

interface Booking { id: string; badge: number; status: string; paidAmount: string; member: { name: string; email: string; mobile: string; gender: string }; }
interface City { id: string; name: string; }

export default function EventBookingsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const [newMember, setNewMember] = useState({ name: '', gender: 'MALE', email: '', cityId: '', dateOfBirth: '', mobile: '' });
  const [error, setError] = useState<string | null>(null);

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
            <tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Status</th></tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-t border-ink/5">
                <td className="px-4 py-3 text-ink/40">{String(b.badge).padStart(2, '0')}</td>
                <td className="px-4 py-3 font-bold text-ink">{b.member.name}</td>
                <td className="px-4 py-3 text-ink/60">{b.member.email} · {b.member.mobile}</td>
                <td className="px-4 py-3">{b.status === 'CONFIRMED' ? `Paid $${b.paidAmount}` : b.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
