/**
 * Run on a nightly schedule (cron / hosting platform scheduled job) at midnight.
 * Finds every event that happened today and hasn't had matches calculated yet,
 * calculates matches for each, and sends result emails.
 *
 * Also invoked directly (with a single eventId) by the admin "Close event now &
 * calculate early" action — see src/app/api/admin/events/[id]/close/route.ts
 */

import { prisma } from '../lib/prisma';
import { calculateMatchesForEvent } from '../lib/calculateMatches';
import { sendMatchEmails } from '../lib/sendMatchEmails';

async function run() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const eventsToClose = await prisma.event.findMany({
    where: {
      matchesCalculated: false,
      startsAt: { gte: startOfToday, lt: new Date() },
    },
  });

  for (const event of eventsToClose) {
    console.log(`Calculating matches for event #${event.number} (${event.name})...`);
    const result = await calculateMatchesForEvent(event.id);
    console.log(`  -> ${result.matchesCreated} matches created`);
    await sendMatchEmails(event.id);
  }

  console.log(`Done. Processed ${eventsToClose.length} event(s).`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
