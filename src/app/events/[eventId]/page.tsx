'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Field, Input } from '@/components/ui';

interface EventDetail {
  id: string;
  name: string;
  venue: string;
  startsAt: string;
  ageMin: number;
  ageMax: number;
  cost: string;
  maxMen: number;
  maxWomen: number;
  menBooked: number;
  womenBooked: number;
  alreadyBooked: boolean;
  theme: { name: string };
  city: { name: string };
}

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [discountCode, setDiscountCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    fetch(`/api/events/${eventId}`).then((r) => r.json()).then(setEvent);
  }, [eventId]);

  async function handleBook() {
    setError(null);
    setBooking(true);
    const res = await fetch(`/api/events/${eventId}/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discountCode: discountCode || undefined }),
    });
    const data = await res.json();
    setBooking(false);
    // A logged-out visitor can browse events but can't book one. Send them to
    // log in and return them to this event afterwards, rather than showing a
    // dead-end "Not authenticated" message with nothing to act on.
    if (res.status === 401) {
      router.push(`/login?next=${encodeURIComponent(`/events/${eventId}`)}`);
      return;
    }
    if (!res.ok) {
      setError(data.error ?? 'Something went wrong — please try again.');
      return;
    }
    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
    } else {
      router.push(`/events/${eventId}/booked`);
    }
  }

  if (!event) return <p className="text-sm text-ink/50">Loading…</p>;

  const date = new Date(event.startsAt);
  const spotsLeft = event.maxMen + event.maxWomen - (event.menBooked + event.womenBooked);

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-5 rounded-xl bg-gradient-to-br from-plum to-plum-dark p-6 text-white">
        {/* Plain text, not the pill <Badge>: on this purple panel the muted
            badge rendered dark grey on near-transparent grey (unreadable),
            and its pill padding pushed it out of line with the heading and
            venue below. White, and flush with them. */}
        <p className="text-xs font-bold uppercase tracking-wide text-white/80">{event.theme.name}</p>
        <h1 className="mt-2 text-xl font-extrabold">{event.name}</h1>
        <p className="mt-1 text-sm text-white/80">{event.venue}, {event.city.name}</p>
      </div>

      <Card className="mb-4">
        <Row label="Date & time" value={`${date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}, ${date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`} />
        <Row label="Ages" value={`${event.ageMin}–${event.ageMax}`} />
        <Row label="Spots left" value={`${spotsLeft} remaining`} />
      </Card>

      <Card className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-xs font-bold uppercase text-ink/50">Ticket price</div>
          <div className="text-2xl font-extrabold text-plum">${event.cost}</div>
        </div>
        <div className="w-40">
          <Field label="Discount code">
            <Input value={discountCode} onChange={(e) => setDiscountCode(e.target.value.toUpperCase())} placeholder="Optional" />
          </Field>
        </div>
      </Card>

      {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}

      {event.alreadyBooked ? (
        <p className="rounded-lg bg-green/15 p-3 text-center text-sm font-bold text-green-dark">You're already booked in for this event.</p>
      ) : (
        <Button onClick={handleBook} disabled={booking || spotsLeft <= 0} className="w-full">
          {spotsLeft <= 0 ? 'Sold out' : booking ? 'Booking…' : 'Book this event'}
        </Button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-ink/5 py-2.5 text-sm last:border-0">
      <span className="text-ink/50">{label}</span>
      <span className="font-bold text-ink">{value}</span>
    </div>
  );
}
