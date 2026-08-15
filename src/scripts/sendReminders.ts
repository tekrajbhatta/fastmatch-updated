/**
 * Run on a schedule (every hour or so is plenty — hosting platform's
 * scheduled/cron job support, same mechanism as calculateMatches.ts and
 * processCampaignSends.ts) to send the pre-event reminder email.
 *
 * This was the one item from the audit that had no code at all — the
 * template existed (eventReminderEmail), nothing ever called it.
 *
 * Sends to every CONFIRMED booking for an event happening in the next
 * 24-48 hours that hasn't had its reminder sent yet, then marks it sent
 * so re-running the job (or running it more than once a day) never
 * double-sends.
 */

import { prisma } from '../lib/prisma';
import { sendEmail } from '../lib/emails/send';
import { eventReminderEmail } from '../lib/emails/eventEmails';

const REMINDER_WINDOW_START_HOURS = 24;
const REMINDER_WINDOW_END_HOURS = 48;

async function run() {
  const now = new Date();
  const windowStart = new Date(now.getTime() + REMINDER_WINDOW_START_HOURS * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_END_HOURS * 60 * 60 * 1000);

  const bookings = await prisma.booking.findMany({
    where: {
      status: 'CONFIRMED',
      reminderSent: false,
      event: { startsAt: { gte: windowStart, lte: windowEnd } },
    },
    include: { member: true, event: true },
  });

  let sent = 0;
  for (const booking of bookings) {
    try {
      const { subject, html } = eventReminderEmail({
        memberName: booking.member.name,
        eventName: booking.event.name,
        startsAt: booking.event.startsAt,
        venue: booking.event.venue,
      });
      await sendEmail({ to: booking.member.email, subject, html });
      await prisma.booking.update({ where: { id: booking.id }, data: { reminderSent: true } });
      sent++;
    } catch (err) {
      // Don't let one failed reminder stop the rest of the batch — it'll
      // just be picked up again next run since reminderSent stays false.
      console.error(`Reminder failed for booking ${booking.id}:`, err);
    }
  }

  console.log(`Sent ${sent} of ${bookings.length} reminder(s).`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
