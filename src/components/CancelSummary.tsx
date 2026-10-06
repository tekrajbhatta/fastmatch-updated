'use client';

import { formatPrice } from '@/lib/price';

/** What "Cancel event" did (src/lib/cancelEvent.ts), as the API returns it. */
export interface CancelResult {
  notified: number;
  notifyFailures: { member: string; channel: 'email' | 'sms' }[];
  refunded: { member: string; amount: number }[];
  refundFailed: { member: string; reason: string }[];
  byHand: { member: string; amount: number; method: string }[];
  paymentsClosed: number;
  paymentsArriving: number;
  /** The series page: how many were cancelled, and any it left alone. */
  cancelled?: number;
  skipped?: { number: number; reason: string }[];
}

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

/**
 * What happened when an event was cancelled: who was told, whose card was
 * refunded, and what's left for the admin to do by hand.
 */
export default function CancelSummary({ result }: { result: CancelResult }) {
  const refundedTotal = result.refunded.reduce((sum, r) => sum + r.amount, 0);
  return (
    <div className="space-y-2 text-sm text-ink">
      <p className="font-bold text-green-dark">
        {result.cancelled === undefined
          ? 'Event cancelled.'
          : `${result.cancelled} event${result.cancelled === 1 ? '' : 's'} cancelled.`}
        {' '}{people(result.notified)} emailed and texted that it&apos;s cancelled.
      </p>
      {result.refunded.length > 0 && (
        <p>
          <strong>Refunded to their card ({formatPrice(refundedTotal)}):</strong>{' '}
          {result.refunded.map((r) => `${r.member} (${formatPrice(r.amount)})`).join(', ')}.
        </p>
      )}
      {result.byHand.length > 0 && (
        <p>
          <strong>Not refunded automatically, as they paid another way:</strong>{' '}
          {result.byHand.map((r) => `${r.member} (${r.method}, ${formatPrice(r.amount)})`).join(', ')}.
          {' '}They&apos;re marked Cancelled: refund them yourself if they&apos;ve paid.
        </p>
      )}
      {result.refundFailed.length > 0 && (
        <p className="font-medium text-coral">
          <strong>Couldn&apos;t refund automatically:</strong>{' '}
          {result.refundFailed.map((r) => r.member).join(', ')}. Please refund them in Stripe. You&apos;ve been emailed the details.
        </p>
      )}
      {result.notifyFailures.length > 0 && (
        <p className="font-medium text-coral">
          <strong>Couldn&apos;t be told:</strong>{' '}
          {result.notifyFailures.map((f) => `${f.member} (${f.channel === 'sms' ? 'text' : 'email'})`).join(', ')}. Please contact them yourself.
        </p>
      )}
      {result.paymentsClosed > 0 && (
        <p className="text-ink/60">{result.paymentsClosed} unpaid payment page{result.paymentsClosed === 1 ? ' was' : 's were'} closed, so {result.paymentsClosed === 1 ? 'it' : 'they'} can&apos;t be paid now.</p>
      )}
      {result.paymentsArriving > 0 && (
        <p className="text-ink/60">
          {result.paymentsArriving} payment{result.paymentsArriving === 1 ? ' was' : 's were'} going through as you cancelled: refunded automatically as soon as Stripe confirms {result.paymentsArriving === 1 ? 'it' : 'them'}, and the person is told.
        </p>
      )}
      {!!result.skipped?.length && (
        <p className="text-ink/60">
          Not cancelled: {result.skipped.map((s) => `#${s.number} (${s.reason})`).join(' ')}
        </p>
      )}
    </div>
  );
}
