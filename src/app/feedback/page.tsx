'use client';

import { useEffect, useState } from 'react';
import { FormCard, SplitLayout } from '@/components/site/layout';
import { Button } from '@/components/site/button';
import { Field, FormError, FormSuccess, SelectInput, TextArea } from '@/components/site/form';
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
      setError(typeof data.error === 'string' ? data.error : "Sorry, we couldn't send your feedback just now. Please try again.");
      return;
    }
    setStatus('sent');
  }

  return (
    <SplitLayout
      title="Feedback"
      lead={<>At Fast Match we want to give you the best event experience possible, so we&apos;re always keen to hear your feedback.</>}
    >
      <FormCard>
        {status === 'sent' ? (
          <>
            <FormSuccess>Thanks, your feedback has been sent to the Fast Match team.</FormSuccess>
            <Button variant="secondary" block onClick={() => { setMessage(''); setEventId(''); setStatus('idle'); }}>Send more feedback</Button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Field label="My feedback is about the event">
              <SelectInput value={eventId} onChange={(e) => setEventId(e.target.value)}>
                <option value="">None (general comment)</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {formatEventForViewer(ev.startsAt, ev.city.name).dateWithYear}: {ev.name} at {ev.venue.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Your feedback">
              <TextArea
                required
                rows={6}
                maxLength={5000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>
            {error && <FormError>{error}</FormError>}
            <Button type="submit" disabled={status === 'sending' || !message.trim()} loading={status === 'sending'} block className="mt-1">
              {status === 'sending' ? 'Sending…' : 'Submit my feedback'}
            </Button>
          </form>
        )}
      </FormCard>
    </SplitLayout>
  );
}
