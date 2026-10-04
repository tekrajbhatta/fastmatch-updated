/**
 * Bulk member import — for the one-time migration of the old 64k-member
 * database, or any other CSV list Gil gets hold of.
 *
 * Deliberately CSV-in, not a live MySQL connection: the old
 * ct_fast_dxe5n database should never be a runtime dependency of the new
 * app (see the spec doc — one-time import only). Exporting to CSV first
 * also gives a natural checkpoint to review/clean the data before it goes
 * anywhere near the new database.
 *
 * Usage:
 *   npm run import-members -- path/to/members.csv
 *
 * Expected CSV columns (header row required):
 *   name, gender, email, dateOfBirth, mobile, city, marketingOptIn, contactMethod
 *   Values in any capitals, with spaces (src/lib/importRow.ts):
 *   - gender: male / female (or M / F)
 *   - dateOfBirth: YYYY-MM-DD
 *   - city: must match one of the confirmed city list — unmatched rows are
 *     skipped and reported, not guessed at
 *   - marketingOptIn: yes / true / 1, or no / false / 0 (optional, blank = yes)
 *   - contactMethod: Email and SMS / Email / SMS / Do not contact (optional,
 *     blank = Email and SMS)
 *
 * Every skipped row goes into <file>.skipped.csv beside the input, with the
 * reason in the last column. Fix it there and import that file the same way.
 *
 * Deliberately NEVER reads or maps any card/payment columns — if the
 * source export includes them, this script ignores those columns entirely
 * rather than importing them. See the spec doc's PCI-DSS note.
 */

import { prisma } from '../lib/prisma';
import { parse } from 'csv-parse';
import { createReadStream, writeFileSync } from 'fs';
import { importContactMethod, importOptIn, importGender, cityKey, importCell, skippedRowsCsv } from '../lib/importRow';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const BATCH_SIZE = 500;

interface ImportRow {
  name: string;
  gender: string;
  email: string;
  dateOfBirth: string;
  mobile: string;
  city: string;
  marketingOptIn?: string;
  contactMethod?: string;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npm run import-members -- path/to/members.csv');
    process.exit(1);
  }

  const cities = await prisma.city.findMany();
  const cityByName = new Map(cities.map((c) => [cityKey(c.name), c.id]));

  let batch: ImportRow[] = [];
  let imported = 0;
  let skipped = 0;
  let duplicates = 0;
  const skippedRows: { row: ImportRow; reason: string }[] = [];

  const parser = createReadStream(filePath).pipe(
    parse({ columns: true, skip_empty_lines: true, trim: true })
  );

  for await (const record of parser) {
    // A report's formula guards come off (see importCell).
    batch.push(Object.fromEntries(Object.entries(record as Record<string, string>).map(([k, v]) => [k, importCell(v)])) as unknown as ImportRow);
    if (batch.length >= BATCH_SIZE) {
      const result = await processBatch(batch, cityByName);
      imported += result.imported;
      skipped += result.skipped;
      duplicates += result.duplicates;
      skippedRows.push(...result.skippedRows);
      batch = [];
      console.log(`Progress: ${imported} imported, ${duplicates} duplicates skipped, ${skipped} invalid skipped`);
    }
  }
  if (batch.length) {
    const result = await processBatch(batch, cityByName);
    imported += result.imported;
    skipped += result.skipped;
    duplicates += result.duplicates;
    skippedRows.push(...result.skippedRows);
  }

  console.log(`\nDone. ${imported} imported, ${duplicates} duplicates (email already existed), ${skipped} skipped (bad data).`);
  if (skippedRows.length) {
    // All of them, not just the first 50 on screen.
    const reportPath = `${filePath}.skipped.csv`;
    writeFileSync(reportPath, skippedRowsCsv(skippedRows as unknown as { row: Record<string, string>; reason: string }[]));
    console.log(`\nEvery skipped row, with the reason, is in ${reportPath}`);
    console.log('Fix them there and import that file the same way. The first few:');
    for (const s of skippedRows.slice(0, 10)) {
      console.log(`  ${s.row.email || '(no email)'} — ${s.reason}`);
    }
  }
}

async function processBatch(rows: ImportRow[], cityByName: Map<string, string>) {
  let imported = 0;
  let skipped = 0;
  let duplicates = 0;
  const skippedRows: { row: ImportRow; reason: string }[] = [];

  for (const row of rows) {
    try {
      if (!row.email || !row.name || !row.mobile) {
        skipped++;
        skippedRows.push({ row, reason: 'Missing required field (name/email/mobile)' });
        continue;
      }

      const gender = importGender(row.gender);
      if (!gender) {
        skipped++;
        skippedRows.push({ row, reason: `Unrecognised gender "${row.gender ?? ''}" (use male or female)` });
        continue;
      }

      const contactMethod = importContactMethod(row.contactMethod);
      if (!contactMethod) {
        skipped++;
        skippedRows.push({ row, reason: `Unrecognised contact method "${row.contactMethod}" (use Email and SMS, Email, SMS or Do not contact)` });
        continue;
      }

      const marketingOptIn = importOptIn(row.marketingOptIn);
      if (marketingOptIn === null) {
        skipped++;
        skippedRows.push({ row, reason: `Unrecognised offers value "${row.marketingOptIn}" (use yes or no)` });
        continue;
      }

      const cityId = cityByName.get(cityKey(row.city));
      if (!cityId) {
        skipped++;
        skippedRows.push({ row, reason: `City "${row.city}" doesn't match the confirmed city list` });
        continue;
      }

      const dob = new Date(row.dateOfBirth);
      if (isNaN(dob.getTime())) {
        skipped++;
        skippedRows.push({ row, reason: `Invalid date of birth "${row.dateOfBirth}"` });
        continue;
      }

      const existing = await prisma.member.findUnique({ where: { email: row.email } });
      if (existing) {
        duplicates++;
        continue;
      }

      // No password exists to carry over — imported members get a random
      // unusable password hash and must use "Forgot password" to set a real
      // one the first time they log in. Never invent or reuse a password.
      const randomPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);

      await prisma.member.create({
        data: {
          name: row.name,
          gender,
          email: row.email,
          passwordHash: randomPasswordHash,
          cityId,
          dateOfBirth: dob,
          mobile: row.mobile,
          // Imported members are treated as already-verified — they were
          // active, communicating members of the old system. New
          // registrants still go through full email+SMS verification.
          emailVerified: true,
          mobileVerified: true,
          agreedTerms: false, // imported members have NOT agreed to this site's T&Cs — must accept on first login, same gate as booking below
          marketingOptIn,
          contactMethod,
        },
      });
      imported++;
    } catch (err) {
      skipped++;
      skippedRows.push({ row, reason: `Unexpected error: ${(err as Error).message}` });
    }
  }

  return { imported, skipped, duplicates, skippedRows };
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
