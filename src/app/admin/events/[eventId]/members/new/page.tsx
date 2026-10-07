'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Field, Input, Select, Loader, BackLink } from '@/components/ui';
import { venueLine } from '@/lib/venue';
import { PAYMENT_METHODS } from '@/lib/paymentMethod';
import { eventClock } from '@/lib/timezone';
import NewMemberFields, { BLANK_NEW_MEMBER } from '@/components/NewMemberFields';

interface EventSummary {
  id: string; name: string; startsAt: string; cost: string; cityId: string;
  venue: { name: string; address: string | null }; city: { name: string }; status: string;
}
interface City { id: string; name: string; }

/**
 * "Add a new member" — for someone NOT yet registered: creates their account
 * and books them into this event in one go. Already-registered people go
 * through "Add a new booking" instead (the API refuses a duplicate email and
 * says so).
 */
export default function AddMemberPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [form, setForm] = useState({
    ...BLANK_NEW_MEMBER,
    // Checked in by default (Gil): most people are added at the door.
    paymentMethod: 'CASH', paidAmount: '', checkedIn: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);

  useEffect(() => {
    fetch('/api/cities').then((r) => r.json()).then(setCities);
    fetch(`/api/admin/events/${eventId}`).then((r) => (r.ok ? r.json() : null)).then((e: EventSummary | null) => {
      setEvent(e);
      // Default location to the event's city and the amount to the ticket price.
      if (e) setForm((f) => ({ ...f, cityId: e.cityId, paidAmount: String(Number(e.cost)) }));
    });
  }, [eventId]);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/admin/events/${eventId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, paidAmount: Number(form.paidAmount || 0) }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Please check the member details.'); return; }

    // Anything that was meant to go out but didn't — the member and booking
    // ARE saved; this is only who to follow up with by hand.
    const n = data.notified ?? {};
    const missed: string[] = [];
    if (n.bookingEmail === false) missed.push('the booking confirmation email (with how to log in)');
    if (n.verificationEmail === false) missed.push('the email confirmation link');
    if (n.verificationSms === false) missed.push('the mobile confirmation code');
    if (missed.length === 0) {
      router.push(`/admin/events/${eventId}/bookings`);
      return;
    }
    setWarnings(missed.map((m) => `${data.member?.name ?? 'The member'} was added (badge #${data.badge}), but ${m} couldn’t be sent.`));
  }

  if (!event) return <Loader />;
  // Nobody can be booked into a cancelled event (the server refuses too).
  if (event.status === 'CANCELLED') {
    return (
      <div className="mx-auto max-w-2xl">
        <BackLink href={`/admin/events/${eventId}`}>Back to event</BackLink>
        <h1 className="mb-1 text-2xl font-extrabold text-ink">Add a new member</h1>
        <Card><p className="text-sm text-ink/70">This event was cancelled, so nobody can be booked into it.</p></Card>
      </div>
    );
  }
  // The event's date on its city's clock, as it's advertised.
  const clock = eventClock(event.startsAt, event.city.name);

  if (warnings) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="mb-4 text-2xl font-extrabold text-ink">Member added</h1>
        <Card className="mb-4">
          {warnings.map((w) => <p key={w} className="mb-2 text-sm text-ink/70">{w}</p>)}
          <p className="text-sm text-ink/50">Please contact them directly.</p>
        </Card>
        <Link href={`/admin/events/${eventId}/bookings`} className="text-sm font-bold text-plum hover:underline">View bookings →</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <BackLink href={`/admin/events/${eventId}`}>Back to event</BackLink>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Add a new member</h1>
      <p className="mb-6 text-sm text-ink/60">
        Registers them and books them into {event.name} · {venueLine(event.venue)} ·{' '}
        {clock.date({ weekday: 'short', day: 'numeric', month: 'short' })}.{' '}
        Already a member?{' '}
        <Link href={`/admin/events/${eventId}/bookings/new`} className="font-bold text-plum hover:underline">Add a new booking</Link> instead.
      </p>

      <form onSubmit={handleSubmit}>
        <NewMemberFields form={form} set={set} cities={cities} confirmationNote="Either way, they’re booked into this event now." />

        <Card className="mb-4">
          <h2 className="mb-3 font-extrabold text-ink">Booking</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Payment status">
              <Select value={form.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value })}>
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </Field>
            <Field label="Paid ($)">
              <Input type="number" step="0.01" min="0" value={form.paidAmount} onChange={(e) => set({ paidAmount: e.target.value })} />
            </Field>
          </div>
          {form.paymentMethod === 'CARD' && (
            <p className="mb-4 rounded-lg bg-cream/60 p-3 text-xs text-ink/70">
              Card details aren&apos;t taken on this screen. Charge the card separately (e.g. in Stripe), then save.
            </p>
          )}
          <label className="mb-4 flex items-start gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" className="mt-0.5" checked={form.checkedIn} onChange={(e) => set({ checkedIn: e.target.checked })} />
            <span>
              Checked in
              <span className="block text-xs font-normal text-ink/50">Untick if you&apos;re booking them in ahead of the night.</span>
            </span>
          </label>
          <p className="text-xs text-ink/50">
            They&apos;re booked in as paid and emailed a booking confirmation, which also says how to log in with this password or choose their own.
          </p>
        </Card>

        {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}
        <Button type="submit" disabled={saving} loading={saving} className="w-full">{saving ? 'Saving…' : 'Create member & add to event'}</Button>
      </form>
    </div>
  );
}
