/**
 * Run on a nightly schedule (cron / hosting platform scheduled job) at midnight.
 * Finds every event from the evening just gone (and any from the last week a
 * missed run left behind) that hasn't had matches calculated yet, calculates
 * matches for each, and sends result emails. Which events, exactly, is
 * eventsDueForResults in src/lib/nightlyResults.ts.
 *
 * The admin "Close event now & calculate early" action does the same for a
 * single event — see src/app/api/admin/events/[id]/close/route.ts
 */

import { prisma } from '../lib/prisma';
import { calculateMatchesForEvent } from '../lib/calculateMatches';
import { sendMatchEmails } from '../lib/sendMatchEmails';
import { eventsDueForResults, resultsDue } from '../lib/nightlyResults';

async function run() {
  const now = new Date();
  const eventsToClose = (await prisma.event.findMany({
    where: eventsDueForResults(now),
    include: { city: true },
    orderBy: { startsAt: 'asc' },
  })).filter((e) => resultsDue(e, now)); // only once their choices have closed

  // Each event on its own: one that fails is logged and the rest still go.
  let failed = 0;
  for (const event of eventsToClose) {
    try {
      console.log(`Calculating matches for event #${event.number} (${event.name})...`);
      const result = await calculateMatchesForEvent(event.id);
      console.log(`  -> ${result.matchesCreated} matches created`);
      const emails = await sendMatchEmails(event.id);
      console.log(`  -> ${emails.sent} result email(s) sent`);
      if (emails.failed.length) console.error(`  -> ${emails.failed.length} couldn't be emailed: ${emails.failed.map((f) => f.email || f.name).join(', ')}`);
    } catch (err) {
      failed++;
      console.error(`  -> event #${event.number} failed:`, err);
    }
  }

  console.log(`Done. Processed ${eventsToClose.length - failed} of ${eventsToClose.length} event(s).`);
  // A non-zero exit still flags the run in the cron log.
  if (failed > 0) process.exitCode = 1;
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
