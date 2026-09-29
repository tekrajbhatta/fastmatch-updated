'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Field, Select } from '@/components/ui';
import { formatEventForViewer } from '@/lib/timezone';

interface FeedbackEvent { id: string; name: string; startsAt: string; venue: { name: string }; city: { name: string } }

/** The old site's Feedback page: pick an event (or a general comment), write, send to Gil. */
export default function FeedbackPage() {
  const [events, setEvents] = useState<FeedbackEvent[]>([]);
  const [eventId, setEventId] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/feedback').then((r) => r.json()).then((d) => setEvents(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus('sending');
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: eventId || undefined, message }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    // Only claim it's sent if it was — and on failure keep what they wrote.
    if (!res?.ok) {
      setStatus('idle');
      setError(typeof data.error === 'string' ? data.error : "Sorry — we couldn't send your feedback just now. Please try again.");
      return;
    }
    setStatus('sent');
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-2 text-2xl font-extrabold text-ink">Feedback</h1>
      <p className="mb-6 text-sm text-ink/60">
        At Fast Match we want to give you the best event experience possible, so we&apos;re always keen to hear your feedback.
      </p>
      <Card>
        {status === 'sent' ? (
          <div>
            <p className="mb-4 text-sm font-bold text-green-dark">Thanks — your feedback has been sent to the Fast Match team.</p>
            <Button variant="ghost" onClick={() => { setMessage(''); setEventId(''); setStatus('idle'); }}>Send more feedback</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <Field label="My feedback is about the event">
              <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
                <option value="">None — general comment</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {formatEventForViewer(ev.startsAt, ev.city.name).dateWithYear} — {ev.name} at {ev.venue.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Your feedback">
              <textarea
                required
                rows={6}
                maxLength={5000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-plum"
              />
            </Field>
            {error && <p className="mb-4 text-sm font-medium text-coral">{error}</p>}
            <Button type="submit" disabled={status === 'sending' || !message.trim()} className="w-full">
              {status === 'sending' ? 'Sending…' : 'Submit my feedback'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
