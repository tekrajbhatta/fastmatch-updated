/**
 * Marks every member brought over from the old site (the import of 10 Nov
 * 2026) as having a confirmed email address. Gil, 12 Nov: "switch members who
 * did not confirm emails to 'confirmed' for all the members which we recently
 * migrated. It's ok to do that."
 *
 * Who counts as imported: everyone the import run inserted. Members have no
 * "imported" flag and their createdAt is their old join date, so the run is
 * found from the ids (src/lib/importRow.ts, cuidTime/importRunWindow): the
 * members still holding the import's placeholder password give its time span,
 * and everyone inserted in that span is an imported member, including those
 * who have chosen their own password since. Nobody who signed up on the new
 * site, was added by the admin or was booked in by a friend is touched, nor
 * any admin account.
 *
 * What changes for them: their email shows as confirmed, "Finish setting up"
 * no longer asks them to confirm it, and email blasts can reach them (still
 * only if they're subscribed to offers, their address hasn't bounced and their
 * contact preference includes email). Nothing is sent to anyone.
 *
 * Usage, on the server (as the site's own user):
 *   # 1. Preview: always run this first. Changes nothing.
 *   npm run confirm-imported-emails
 *
 *   # 2. Confirm them
 *   npm run confirm-imported-emails -- --confirm
 *
 * Safe to run again: a second run finds nobody left to confirm.
 */

import { prisma } from '../src/lib/prisma';
import { cuidTime, importRunWindow, IMPORTED_PASSWORD_PREFIX } from '../src/lib/importRow';
import { maskEmail } from '../src/lib/logMask';

const sydney = (ms: number) =>
  new Date(ms).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

async function main() {
  const confirm = process.argv.includes('--confirm');
  console.log(`${confirm ? 'CONFIRMING' : 'PREVIEW (nothing will change)'}: email addresses of members imported from the old site\n`);

  const markers = await prisma.member.findMany({
    where: { passwordHash: { startsWith: IMPORTED_PASSWORD_PREFIX } },
    select: { id: true },
  });
  const window = importRunWindow(markers.map((m) => m.id));
  if (!window) {
    console.log('No imported members found (nobody holds the import\'s placeholder password). Nothing to do.');
    return;
  }

  const everyone = await prisma.member.findMany({
    select: { id: true, email: true, isAdmin: true, emailVerified: true, emailBounced: true, marketingOptIn: true, contactMethod: true, passwordHash: true },
  });
  const imported = everyone.filter((m) => {
    const t = cuidTime(m.id);
    return t !== null && t >= window.from && t <= window.to && !m.isAdmin;
  });
  const toConfirm = imported.filter((m) => !m.emailVerified);
  const stillOnImportPassword = toConfirm.filter((m) => m.passwordHash.startsWith(IMPORTED_PASSWORD_PREFIX)).length;
  const blastable = toConfirm.filter((m) => m.marketingOptIn && !m.emailBounced && (m.contactMethod === 'EMAIL_AND_SMS' || m.contactMethod === 'EMAIL')).length;
  const importedIds = new Set(imported.map((m) => m.id));
  const otherUnconfirmed = everyone.filter((m) => !m.emailVerified && !importedIds.has(m.id)).length;

  console.log(`Import run: ${sydney(window.from + 60_000)} to ${sydney(window.to - 60_000)} (Sydney time)`);
  console.log(`  ${imported.length} member(s) inserted by it`);
  console.log(`  ${imported.length - toConfirm.length} already have a confirmed email`);
  console.log(`  ${toConfirm.length} not confirmed: ${confirm ? 'confirming now' : 'would be confirmed'}`);
  console.log(`     ${stillOnImportPassword} haven't logged in yet, ${toConfirm.length - stillOnImportPassword} have chosen their own password since`);
  console.log(`     ${blastable} of them are subscribed to offers with email in their contact preference, so email blasts will reach them from now on`);
  console.log(`  Not touched: ${otherUnconfirmed} other member(s) with an unconfirmed email (signed up, added or booked in another way)`);
  if (toConfirm.length) {
    console.log(`  For example: ${toConfirm.slice(0, 5).map((m) => maskEmail(m.email)).join(', ')}`);
  }
  console.log('');

  if (!toConfirm.length) {
    console.log('Nothing to change: every imported member already has a confirmed email.');
    return;
  }
  if (!confirm) {
    console.log('Preview only. Re-run with --confirm to mark them confirmed.');
    return;
  }

  // In chunks, all in one transaction: a failure part-way changes nobody.
  const ids = toConfirm.map((m) => m.id);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 1000) chunks.push(ids.slice(i, i + 1000));
  const results = await prisma.$transaction(
    chunks.map((chunk) => prisma.member.updateMany({ where: { id: { in: chunk }, emailVerified: false }, data: { emailVerified: true } })),
  );
  const changed = results.reduce((n, r) => n + r.count, 0);
  console.log(`Done: ${changed} imported member(s) now have a confirmed email. Run it again to check: it should find nobody left.`);
}

main()
  .catch((err) => {
    console.error('confirm-imported-emails failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
