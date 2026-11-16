import { prisma } from './prisma';
import { sendEmail } from './emails/send';
import { sendSms } from './sms/send';
import { emailLayout } from './emails/layout';
import { escapeHtml } from './escapeHtml';
import { formatEventShort, formatEventWhen } from './datetime';
import { timeZoneForCity } from './timezone';
import { formatPrice } from './price';
import { eventLabel } from './eventLabel';
import { FASTMATCH_CONTACT_EMAIL } from './contactEmail';
import type { CancelOutcome } from './cancelEvent';

type CancelledEvent = {
  id: string; number: number; name: string; startsAt: Date;
  theme: { name: string }; city: { name: string }; venue: { name: string };
};

/**
 * A franchisee cancelled one of their events (Gil's answer 5, 15 Nov: "I need
 * to know that event has been cancelled.. maybe SMS to me?"). Gil gets a text
 * at his admin account's mobile, and an email with what was refunded. Never
 * throws: the event is cancelled already.
 */
export async function alertFranchiseCancelled(opts: { franchisee: { name: string; email: string }; event: CancelledEvent; outcome: CancelOutcome }): Promise<void> {
  const { franchisee, event, outcome } = opts;
  const tz = timeZoneForCity(event.city.name);
  const label = `#${event.number} ${eventLabel(event)}`;
  const refundedTotal = outcome.refunded.reduce((sum, r) => sum + r.amount, 0);
  const sms = franchiseCancelSms({ franchiseeName: franchisee.name, label, city: event.city.name, when: formatEventShort(event.startsAt, tz), booked: outcome.notified, byHand: outcome.byHand.length + outcome.refundFailed.length });

  try {
    const gil = await prisma.member.findFirst({ where: { email: FASTMATCH_CONTACT_EMAIL, isAdmin: true }, select: { mobile: true } });
    if (gil?.mobile.trim()) await sendSms({ to: gil.mobile, body: sms });
  } catch (err) {
    console.error(`Event ${event.id}: the franchise cancellation text to Gil failed`, err);
  }

  const lines = [
    ...outcome.refunded.map((r) => `${escapeHtml(r.member)}: ${formatPrice(r.amount)} refunded to their card`),
    ...outcome.refundFailed.map((r) => `${escapeHtml(r.member)}: the card refund didn't go through (${escapeHtml(r.reason)}), so it needs refunding in Stripe`),
    ...outcome.byHand.map((b) => `${escapeHtml(b.member)}: paid ${formatPrice(b.amount)} by ${escapeHtml(b.method)}, to refund by hand`),
  ];
  try {
    await sendEmail({
      to: FASTMATCH_CONTACT_EMAIL,
      replyTo: franchisee.email,
      subject: `Franchise event cancelled: ${label}`.replace(/[\r\n]+/g, ' '),
      html: emailLayout(`
        <p style="margin:0 0 16px;"><strong>${escapeHtml(franchisee.name)}</strong> (${escapeHtml(franchisee.email)}) has cancelled this event:</p>
        <p style="margin:0 0 16px;"><strong>${escapeHtml(label)}</strong><br>
        ${escapeHtml(event.venue.name)}, ${escapeHtml(event.city.name)}<br>
        ${escapeHtml(formatEventWhen(event.startsAt, tz))}</p>
        <p style="margin:0 0 16px;">${outcome.notified} ${outcome.notified === 1 ? 'person was' : 'people were'} emailed and texted that it's cancelled.
        ${refundedTotal > 0 ? `${formatPrice(refundedTotal)} was refunded to cards automatically.` : ''}</p>
        ${lines.length ? `<ul style="margin:0 0 16px;padding-left:20px;">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : ''}
        <p style="margin:0 0 16px;">The event page in the admin has the details. Replying to this email writes to ${escapeHtml(franchisee.name)}.</p>
      `),
    });
  } catch (err) {
    console.error(`Event ${event.id}: the franchise cancellation email to Gil failed`, err);
  }
}

/** The text to Gil: who cancelled what, how many were booked, and any refunds left for him. */
export function franchiseCancelSms(o: { franchiseeName: string; label: string; city: string; when: string; booked: number; byHand: number }): string {
  const refunds = o.byHand > 0 ? ` ${o.byHand} to refund by hand.` : '';
  return `FastMatch: ${o.franchiseeName} cancelled ${o.label}, ${o.city}, ${o.when}. ${o.booked} booked were told.${refunds}`;
}
