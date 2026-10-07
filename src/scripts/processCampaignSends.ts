/**
 * Run on a schedule (every 1-2 minutes — hosting platform's scheduled/cron
 * job support, same mechanism as calculateMatches.ts's nightly job) to drive
 * every in-progress campaign send forward one batch at a time, until each
 * completes. This is what makes sending to a 5,000-recipient list safe on
 * serverless hosting — no single request has to send more than one batch's
 * worth (100 recipients) before returning.
 */

import { prisma } from '../lib/prisma';
import { processCampaignSendBatch } from '../lib/campaigns/runSend';

async function run() {
  const inProgress = await prisma.campaignSend.findMany({ where: { status: 'SENDING' } });

  for (const send of inProgress) {
    // One send going wrong mustn't hold up the others. It carries on from
    // where it got to next run (each recipient is claimed before sending,
    // so nobody gets it twice).
    try {
      const result = await processCampaignSendBatch(send.id);
      console.log(`Send ${send.id}: ${result.sentCount} sent, status ${result.status}`);
    } catch (err) {
      console.error(`Send ${send.id}: this batch failed`, err);
    }
  }

  console.log(`Processed ${inProgress.length} in-progress send(s).`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
