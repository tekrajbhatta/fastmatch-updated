/**
 * Imports members from a CSV file (members-import/data/members.csv, made by
 * convert-old-members.ts, or any list in the same columns):
 *
 *   npm run import-members -- <members.csv> [--dry-run]
 *
 * --dry-run checks every row and counts what would happen, saving nothing.
 *
 * 500 rows at a time, each batch saved together. Anyone already on the site
 * (the same email address) is left as they are, so the import can be run
 * again after a stop and carries on where it left off. Every row that can't
 * be imported goes into <file>.skipped.csv with the reason.
 *
 * What an imported member gets (rules: src/lib/importRow.ts):
 *   - no password: they set one with "Forgot password?" (the login page
 *     tells old-site members so). Nothing is emailed or texted to anyone.
 *   - Terms not yet accepted: asked before their first booking.
 *   - the email/mobile confirmation, event news and offers, contact method,
 *     city and join date from the file.
 *
 * Never reads card or payment columns, whatever the file contains.
 */

import { prisma } from '../src/lib/prisma';
import { parse } from 'csv-parse';
import { createReadStream, writeFileSync } from 'fs';
import { checkImportRow, cityKey, importCell, importedPasswordMarker, skippedRowsCsv, type ImportedMember } from '../src/lib/importRow';

const BATCH_SIZE = 500;

type Row = Record<string, string>;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const filePath = args.find((a) => !a.startsWith('--'));
  if (!filePath) {
    console.error('Usage: npm run import-members -- <members.csv> [--dry-run]');
    process.exit(1);
  }

  const cities = await prisma.city.findMany();
  const cityIdByKey = new Map(cities.map((c) => [cityKey(c.name), c.id]));
  const now = new Date();
  const started = Date.now();
  const tally = { read: 0, imported: 0, alreadyOnSite: 0, skipped: 0, noMobile: 0, mobileNotUsable: 0, noCity: 0, emailUnconfirmed: 0, offersOff: 0 };
  const skippedRows: { row: Row; reason: string }[] = [];

  async function saveBatch(batch: { row: Row; member: ImportedMember }[]) {
    // Already members (any capitals: the database compares addresses that way),
    // or twice in this batch: left as they are.
    const onSite = await prisma.member.findMany({ where: { email: { in: batch.map((b) => b.member.email) } }, select: { email: true } });
    const taken = new Set(onSite.map((m) => m.email.toLowerCase()));
    const fresh: ImportedMember[] = [];
    for (const { member } of batch) {
      const key = member.email.toLowerCase();
      if (taken.has(key)) { tally.alreadyOnSite++; continue; }
      taken.add(key);
      fresh.push(member);
    }
    if (!dryRun && fresh.length) {
      const result = await prisma.member.createMany({
        data: fresh.map(({ joined, ...m }) => ({
          ...m,
          passwordHash: importedPasswordMarker(),
          agreedTerms: false,
          awaitingPasswordSetup: false,
          ...(joined ? { createdAt: joined } : {}),
        })),
        // Someone who registered while the import ran: theirs is kept.
        skipDuplicates: true,
      });
      tally.alreadyOnSite += fresh.length - result.count;
      tally.imported += result.count;
    } else {
      tally.imported += fresh.length;
    }
  }

  const parser = createReadStream(filePath).pipe(parse({ columns: true, skip_empty_lines: true, trim: true, bom: true }));
  let batch: { row: Row; member: ImportedMember }[] = [];
  for await (const record of parser) {
    // A report's formula guards come off (see importCell).
    const row = Object.fromEntries(Object.entries(record as Row).map(([k, v]) => [k, importCell(v)])) as Row;
    tally.read++;
    const checked = checkImportRow(row, cityIdByKey, now);
    if (!checked.ok) {
      tally.skipped++;
      skippedRows.push({ row, reason: checked.reason });
      continue;
    }
    if (checked.notes.noMobile) tally.noMobile++;
    if (checked.notes.mobileNotUsable) tally.mobileNotUsable++;
    if (checked.notes.noCity) tally.noCity++;
    if (!checked.member.emailVerified) tally.emailUnconfirmed++;
    if (!checked.member.marketingOptIn) tally.offersOff++;
    batch.push({ row, member: checked.member });
    if (batch.length >= BATCH_SIZE) {
      await saveBatch(batch);
      batch = [];
      console.log(`${tally.read} rows read: ${tally.imported} ${dryRun ? 'would be imported' : 'imported'}, ${tally.alreadyOnSite} already on the site, ${tally.skipped} skipped`);
    }
  }
  if (batch.length) await saveBatch(batch);

  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`\n${dryRun ? 'DRY RUN, nothing saved. ' : ''}Done in ${seconds}s. ${tally.read} rows read:`);
  console.log(`  ${tally.imported} ${dryRun ? 'would be imported' : 'imported'}`);
  console.log(`  ${tally.alreadyOnSite} already on the site (same email address), left as they are`);
  console.log(`  ${tally.skipped} skipped (see below)`);
  console.log(`Of the rows read: ${tally.noMobile} without a mobile, ${tally.mobileNotUsable} with a number that isn't an Australian mobile (left out),`);
  console.log(`  ${tally.noCity} without one of the site's cities, ${tally.emailUnconfirmed} with their email not confirmed, ${tally.offersOff} with event news and offers off.`);
  if (skippedRows.length) {
    const reportPath = `${filePath}.skipped.csv`;
    writeFileSync(reportPath, skippedRowsCsv(skippedRows));
    console.log(`\nEvery skipped row, with the reason, is in ${reportPath}. The first few:`);
    for (const s of skippedRows.slice(0, 10)) console.log(`  ${s.row.email || '(no email)'}: ${s.reason}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
