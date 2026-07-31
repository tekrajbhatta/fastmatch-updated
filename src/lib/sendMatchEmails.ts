/**
 * Sends match result emails to every attendee of an event, once matches have
 * been calculated. For each attendee: their Date matches and Friend matches,
 * each with the matched person's name/email/mobile (contact info only shared
 * for actual matches, per the Terms & Conditions).
 *
 * Template is real (see src/lib/emails/matchResultsEmail.ts). The actual
 * provider call in sendEmail() is still a stub until Resend is wired up.
 */

import { prisma } from './prisma';
import { sendEmail } from './emails/send';
import { matchResultsEmail } from './emails/matchResultsEmail';

export async function sendMatchEmails(eventId: string) {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
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

  for (const [memberId, entry] of byMember) {
    const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
    const dateMatches = await prisma.member.findMany({ where: { id: { in: entry.dateMatchIds } } });
    const friendMatches = await prisma.member.findMany({ where: { id: { in: entry.friendMatchIds } } });

    const { subject, html } = matchResultsEmail({
      memberName: member.name,
      eventName: event.name,
      eventDate: event.startsAt,
      dateMatches: dateMatches.map((m) => ({ name: m.name, email: m.email, mobile: m.mobile })),
      friendMatches: friendMatches.map((m) => ({ name: m.name, email: m.email, mobile: m.mobile })),
    });
    await sendEmail({ to: member.email, subject, html });
  }

  await prisma.match.updateMany({ where: { eventId }, data: { emailSent: true } });
  await prisma.event.update({ where: { id: eventId }, data: { matchEmailsSent: true } });
}
