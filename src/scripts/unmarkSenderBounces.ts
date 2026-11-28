/**
 * Un-marks members whose email was marked bounced because of how WE sent it,
 * not because the address is bad: the reason saved blames our sending
 * (blamesOurSending in src/lib/mailgunWebhook.ts: "Sender rejected", "return
 * MX does not exist", SPF/DKIM/DMARC, block lists, spam or policy rules).
 *
 * Written for 28 Nov 2026: mg.fastmatch.com.au had no MX record, so BigPond
 * and o2.pl refused every blast email ("5.7.1 Sender rejected", "refused
 * mailfrom because return MX does not exist") and Mailgun reported each as a
 * permanent failure: four good members were marked bounced. The bounce
 * webhook now leaves such members alone, so this only tidies up the past.
 *
 * Before running it, remove the same addresses from Mailgun's bounce
 * suppressions (Mailgun > Suppressions > Bounces). Otherwise Mailgun won't
 * deliver to them ("Not delivering to previously bounced address") and they
 * are marked bounced again on the next blast.
 *
 * Usage (on the server, from /var/www/fastmatch.com.au/current):
 *   # 1. Preview: lists them, changes nothing.
 *   sudo -u fastmatch -H npm run unmark-sender-bounces
 *
 *   # 2. Un-mark them.
 *   sudo -u fastmatch -H npm run unmark-sender-bounces -- --confirm
 */

import { prisma } from '../lib/prisma';
import { blamesOurSending } from '../lib/mailgunWebhook';
import { maskEmail } from '../lib/logMask';

async function main() {
  const confirm = process.argv.slice(2).includes('--confirm');
  console.log(confirm ? 'UN-MARKING' : 'PREVIEW (nothing will change)');

  const bounced = await prisma.member.findMany({
    where: { emailBounced: true },
    select: { id: true, email: true, bounceReason: true, marketingOptIn: true },
  });
  const found = bounced.filter((m) => blamesOurSending(m.bounceReason ?? ''));

  console.log(`\n${bounced.length} member(s) marked bounced; ${found.length} of them because of our sending, not the address:\n`);
  // Addresses in full (this is run by hand, not logged): they're needed to
  // find the same addresses in Mailgun's bounce suppressions.
  for (const m of found) {
    const reason = (m.bounceReason ?? '').replace(/[^\s<>"'(),;:]+@[^\s<>"'(),;:]+/g, (a) => maskEmail(a)).replace(/\s+/g, ' ').slice(0, 70);
    console.log(`  ${m.email.padEnd(34)} ${m.marketingOptIn ? 'offers on ' : 'offers off'}  ${reason}`);
  }

  if (found.length === 0) {
    console.log('  (none)');
  } else if (confirm) {
    const done = await prisma.member.updateMany({
      where: { id: { in: found.map((m) => m.id) }, emailBounced: true },
      data: { emailBounced: false, bounceReason: null },
    });
    console.log(`\nDone: ${done.count} member(s) un-marked. Their emails go out again from the next blast.`);
  } else {
    console.log('\nNothing changed. First remove these addresses from Mailgun\'s bounce suppressions, then run again with --confirm.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
