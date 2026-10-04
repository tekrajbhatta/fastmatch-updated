/**
 * Sends match result emails to every attendee of an event, once matches have
 * been calculated. For each attendee: their Date matches and Friend matches,
 * each with the matched person's name/email/mobile (contact info only shared
 * for actual matches, per the Terms & Conditions).
 *
 * Template is real (see src/lib/emails/matchResultsEmail.ts), and sendEmail()
 * now sends for real via Mailgun SMTP — it only falls back to a console.log
 * stub when SMTP credentials are absent (local dev and CI).
 */

import { prisma } from './prisma';
import { sendEmail } from './emails/send';
import { matchResultsEmail } from './emails/matchResultsEmail';
import { timeZoneForCity } from './timezone';

/** Who couldn't be emailed their results. */
export interface MatchEmailOutcome {
  sent: number;
  failed: { memberId: string; name: string; email: string }[];
}

export async function sendMatchEmails(eventId: string): Promise<MatchEmailOutcome> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, include: { city: true } });
  const matches = await prisma.match.findMany({ where: { eventId, emailSent: false } });

  // Group matches by member so each attendee gets one email listing all their matches
  const byMember = new Map<string, { memberId: string; dateMatchIds: string[]; friendMatchIds: string[] }>();

  for (const m of matches) {
    for (const [self, other] of [
      [m.memberAId, m.memberBId],
      [m.memberBId, m.memberAId],
    ]) {
      if (!byMember.has(self)) byMember.set(self, { memberId: self, dateMatchIds: [], friendMatchIds: [] });
      const entry = byMember.get(self)!;
      if (m.result === 'DATE') entry.dateMatchIds.push(other);
      else entry.friendMatchIds.push(other);
    }
  }

  // Each member on their own: one failed email used to stop everyone after
  // it, and nothing recorded who had been sent theirs.
  const emailed = new Set<string>();
  const failed: MatchEmailOutcome['failed'] = [];
  for (const [memberId, entry] of byMember) {
    const member = await prisma.member.findUnique({ where: { id: memberId } });
    try {
      if (!member) throw new Error('member no longer exists');
      const dateMatches = await prisma.member.findMany({ where: { id: { in: entry.dateMatchIds } } });
      const friendMatches = await prisma.member.findMany({ where: { id: { in: entry.friendMatchIds } } });

      const { subject, html } = matchResultsEmail({
        memberName: member.name,
        eventName: event.name,
        eventDate: event.startsAt,
        // The event's own date, wherever the member lives.
        timeZone: timeZoneForCity(event.city.name),
        dateMatches: dateMatches.map((m) => ({ name: m.name, email: m.email, mobile: m.mobile })),
        friendMatches: friendMatches.map((m) => ({ name: m.name, email: m.email, mobile: m.mobile })),
      });
      await sendEmail({ to: member.email, subject, html });
      emailed.add(memberId);
    } catch (err) {
      console.error(`Event ${eventId}: results email to member ${memberId} failed`, err);
      failed.push({ memberId, name: member?.name ?? 'Unknown member', email: member?.email ?? '' });
    }
  }

  // A match counts as emailed once both people have had theirs, so the ones
  // left are exactly what a resend would need.
  const done = matches.filter((m) => emailed.has(m.memberAId) && emailed.has(m.memberBId)).map((m) => m.id);
  if (done.length) await prisma.match.updateMany({ where: { id: { in: done } }, data: { emailSent: true } });
  await prisma.event.update({ where: { id: eventId }, data: { matchEmailsSent: failed.length === 0 } });
  return { sent: emailed.size, failed };
}
