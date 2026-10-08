/**
 * Run every hour (cron "0 * * * *"): an event's results are due at midnight
 * on its own city's clock, which for Perth is three hours after Sydney's, so a
 * run only at Sydney's midnight left them until the next night (server
 * checks, 8 Oct). Each run does only what has become due, so most do nothing.
 * Finds every event from the evening just gone (and any from the last week a
 * missed run left behind) that hasn't had matches calculated yet, calculates
 * matches for each, and sends result emails. Which events, exactly, is
 * eventsDueForResults in src/lib/nightlyResults.ts. Results that didn't all
 * go out on an earlier run are tried again (eventsWithResultsToResend).
 *
 * The admin "Close event now & calculate early" action does the same for a
 * single event — see src/app/api/admin/events/[id]/close/route.ts
 */

import { prisma } from '../lib/prisma';
import { calculateMatchesForEvent } from '../lib/calculateMatches';
import { sendMatchEmails } from '../lib/sendMatchEmails';
import { eventsDueForResults, eventsWithResultsToResend, resultsDue } from '../lib/nightlyResults';

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

  // Results worked out on an earlier run that didn't all go out: the rest
  // are tried again (not the ones just done: their failures wait for the
  // next run rather than being retried seconds later).
  const justDone = eventsToClose.map((e) => e.id);
  const toResend = await prisma.event.findMany({
    where: { ...eventsWithResultsToResend(now), id: { notIn: justDone } },
    orderBy: { startsAt: 'asc' },
  });
  let resendFailed = 0;
  for (const event of toResend) {
    try {
      const emails = await sendMatchEmails(event.id);
      console.log(`Event #${event.number}: ${emails.sent} result email(s) sent that hadn't gone before`);
      if (emails.failed.length) console.error(`  -> still ${emails.failed.length} couldn't be emailed: ${emails.failed.map((f) => f.email || f.name).join(', ')}`);
    } catch (err) {
      resendFailed++;
      console.error(`  -> event #${event.number}: resending results failed:`, err);
    }
  }
  if (toResend.length) console.log(`Results still to send: tried again for ${toResend.length - resendFailed} of ${toResend.length} event(s).`);
  failed += resendFailed;

  // A non-zero exit still flags the run in the cron log.
  if (failed > 0) process.exitCode = 1;
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
