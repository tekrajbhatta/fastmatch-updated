/**
 * Records which members a past blast send missed, so the blast's History tab
 * offers "Send to the N who missed out" for it (src/lib/campaigns/runSend.ts).
 * New sends record this themselves; this is for sends from before that.
 *
 * Written for 27-28 Nov 2026: Mailgun refused 77 of Gil's "We're back" emails
 * ("421 … recipient limit (26) exceeded, try again after …"), and the site
 * only counted them. Who they were was worked out from the live database and
 * Mailgun's own logs, as a list of "sendId,memberId" lines.
 *
 * Only members who were on that send's own list are recorded, and nothing is
 * sent: Gil decides, with the History button.
 *
 * Usage (on the server, from /var/www/fastmatch.com.au/current; the list is
 * read from standard input, so it can stay in your own home folder):
 *   # 1. Preview: counts per send, changes nothing.
 *   sudo -u fastmatch -H npm run record-missed-recipients < ~/missed.csv
 *
 *   # 2. Record them.
 *   sudo -u fastmatch -H npm run record-missed-recipients -- --confirm < ~/missed.csv
 */

import { readFileSync } from 'fs';
import { prisma } from '../lib/prisma';
import { parseMissedList } from '../lib/campaigns/missedList';
import { idList } from '../lib/campaigns/runSend';

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const file = args.find((a) => !a.startsWith('--'));
  const text = readFileSync(file ?? 0, 'utf8');
  const { bySend, bad } = parseMissedList(text);

  console.log(confirm ? 'RECORDING' : 'PREVIEW (nothing will change)');
  if (bad > 0) console.log(`${bad} line(s) weren't "sendId,memberId" and were left out.`);
  if (bySend.size === 0) {
    console.log('No sends in the list. Pass it on standard input: … record-missed-recipients < ~/missed.csv');
    process.exit(1);
  }

  for (const [sendId, listed] of bySend) {
    const send = await prisma.campaignSend.findUnique({ where: { id: sendId }, include: { campaign: { select: { title: true } } } });
    if (!send) { console.log(`\n${sendId}: no such send, left out.`); continue; }
    const onSend = new Set(idList(send.recipientIds));
    const already = idList(send.emailFailedIds);
    const candidates = listed.filter((id) => onSend.has(id));
    const members = await prisma.member.findMany({
      where: { id: { in: candidates } },
      select: { id: true, marketingOptIn: true, emailVerified: true, emailBounced: true, contactMethod: true },
    });
    const ids = members.map((m) => m.id);
    const emailable = members.filter((m) => m.marketingOptIn && m.emailVerified && !m.emailBounced && (m.contactMethod === 'EMAIL' || m.contactMethod === 'EMAIL_AND_SMS')).length;
    const merged = [...new Set([...already, ...ids])];

    console.log(`\n"${send.campaign.title}", sent ${send.startedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC (${send.sentCount - send.failedCount} sent, ${send.failedCount} failed):`);
    console.log(`  ${listed.length} listed; ${candidates.length} were on this send's list; ${ids.length} still members; ${emailable} can be emailed now.`);
    if (listed.length > candidates.length) console.log(`  ${listed.length - candidates.length} weren't on this send's list: left out.`);
    console.log(`  Already recorded: ${already.length}. After: ${merged.length}.`);

    if (confirm && merged.length !== already.length) {
      await prisma.campaignSend.update({ where: { id: sendId }, data: { emailFailedIds: merged } });
      console.log('  Recorded.');
    }
  }
  console.log(confirm
    ? '\nDone. The blast\'s History tab now shows "Send to the N who missed out" for these sends.'
    : '\nNothing changed. Run again with --confirm to record them.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
