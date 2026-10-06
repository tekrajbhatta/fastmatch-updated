/**
 * Sends the results emails for an event, once its matches are worked out.
 * Everyone checked in gets one (Gil, 4 Oct): their Date and Friend matches,
 * each with the other person's name, email and mobile (contact details are
 * only shared for actual matches, per the Terms & Conditions), or, with no
 * mutual match, Gil's "don't stop now" email. Members with no match used to
 * get nothing, although the screen after choosing promised an email.
 *
 * Each booking records when its email went (resultsEmailedAt), so nobody is
 * sent theirs twice, and the admin's "N people emailed" counts both kinds.
 *
 * sendEmail() sends for real via Mailgun SMTP — it only falls back to a
 * console.log stub when SMTP credentials are absent (local dev and CI).
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
  const [matches, attendees] = await Promise.all([
    prisma.match.findMany({ where: { eventId } }),
    // Everyone checked in on a paid booking — with a match or not.
    prisma.booking.findMany({
      where: { eventId, status: 'CONFIRMED', checkedIn: true },
      select: { id: true, memberId: true, resultsEmailedAt: true },
    }),
  ]);

  // Each member's matches, so they get one email listing them all.
  const byMember = new Map<string, { dateMatchIds: string[]; friendMatchIds: string[] }>();
  const entry = (id: string) => byMember.get(id) ?? byMember.set(id, { dateMatchIds: [], friendMatchIds: [] }).get(id)!;
  for (const m of matches) {
    for (const [self, other] of [[m.memberAId, m.memberBId], [m.memberBId, m.memberAId]]) {
      if (m.result === 'DATE') entry(self).dateMatchIds.push(other);
      else entry(self).friendMatchIds.push(other);
    }
  }

  // Who still needs theirs: everyone checked in who hasn't had it, and (rarely)
  // someone with a match but no checked-in booking any more, until each of
  // their matches is marked emailed.
  const bookingOf = new Map(attendees.map((b) => [b.memberId, b]));
  const recipients = new Set<string>();
  for (const b of attendees) if (!b.resultsEmailedAt) recipients.add(b.memberId);
  for (const m of matches) {
    if (m.emailSent) continue;
    for (const id of [m.memberAId, m.memberBId]) if (!bookingOf.has(id)) recipients.add(id);
  }

  const eventsUrl = `${(process.env.APP_URL ?? '').replace(/\/+$/, '')}/events`;
  // Each member on their own: one failed email used to stop everyone after
  // it, and nothing recorded who had been sent theirs.
  const emailed = new Set<string>();
  const failed: MatchEmailOutcome['failed'] = [];
  for (const memberId of recipients) {
    const member = await prisma.member.findUnique({ where: { id: memberId } });
    const mine = byMember.get(memberId) ?? { dateMatchIds: [], friendMatchIds: [] };
    try {
      if (!member) throw new Error('member no longer exists');
      const dateMatches = await prisma.member.findMany({ where: { id: { in: mine.dateMatchIds } } });
      const friendMatches = await prisma.member.findMany({ where: { id: { in: mine.friendMatchIds } } });

      const { subject, html } = matchResultsEmail({
        memberName: member.name,
        eventName: event.name,
        eventDate: event.startsAt,
        // The event's own date, wherever the member lives.
        timeZone: timeZoneForCity(event.city.name),
        dateMatches: dateMatches.map((m) => ({ name: m.name, email: m.email, mobile: m.mobile })),
        friendMatches: friendMatches.map((m) => ({ name: m.name, email: m.email, mobile: m.mobile })),
        eventsUrl,
      });
      await sendEmail({ to: member.email, subject, html });
      emailed.add(memberId);
      const booking = bookingOf.get(memberId);
      if (booking) await prisma.booking.update({ where: { id: booking.id }, data: { resultsEmailedAt: new Date() } });
    } catch (err) {
      console.error(`Event ${eventId}: results email to member ${memberId} failed`, err);
      failed.push({ memberId, name: member?.name ?? 'Unknown member', email: member?.email ?? '' });
    }
  }

  // A match counts as emailed once both people have had theirs (now or
  // before), so the ones left are exactly what a resend would need.
  const had = (id: string) => emailed.has(id) || !!bookingOf.get(id)?.resultsEmailedAt;
  const done = matches.filter((m) => !m.emailSent && had(m.memberAId) && had(m.memberBId)).map((m) => m.id);
  if (done.length) await prisma.match.updateMany({ where: { id: { in: done } }, data: { emailSent: true } });
  await prisma.event.update({ where: { id: eventId }, data: { matchEmailsSent: failed.length === 0 } });
  return { sent: emailed.size, failed };
}
