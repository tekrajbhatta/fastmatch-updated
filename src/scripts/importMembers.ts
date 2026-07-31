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
 *   - gender: "MALE" or "FEMALE"
 *   - dateOfBirth: YYYY-MM-DD
 *   - city: must match one of the confirmed city list — unmatched rows are
 *     skipped and logged, not guessed at
 *   - marketingOptIn: "true" / "false" (optional, defaults true)
 *   - contactMethod: EMAIL_AND_SMS / EMAIL / SMS / DO_NOT_CONTACT (optional,
 *     defaults EMAIL_AND_SMS)
 *
 * Deliberately NEVER reads or maps any card/payment columns — if the
 * source export includes them, this script ignores those columns entirely
 * rather than importing them. See the spec doc's PCI-DSS note.
 */

import { Gender, ContactMethod } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { parse } from 'csv-parse';
import { createReadStream } from 'fs';
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
  const cityByName = new Map(cities.map((c) => [c.name.toLowerCase(), c.id]));

  let batch: ImportRow[] = [];
  let imported = 0;
  let skipped = 0;
  let duplicates = 0;
  const skippedRows: { row: ImportRow; reason: string }[] = [];

  const parser = createReadStream(filePath).pipe(
    parse({ columns: true, skip_empty_lines: true, trim: true })
  );

  for await (const record of parser) {
    batch.push(record as ImportRow);
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
    console.log('\nSkipped rows (review and re-run separately once fixed):');
    for (const s of skippedRows.slice(0, 50)) {
      console.log(`  ${s.row.email ?? '(no email)'} — ${s.reason}`);
    }
    if (skippedRows.length > 50) console.log(`  ...and ${skippedRows.length - 50} more`);
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

      const gender = row.gender?.toUpperCase();
      if (gender !== 'MALE' && gender !== 'FEMALE') {
        skipped++;
        skippedRows.push({ row, reason: `Unrecognised gender "${row.gender}"` });
        continue;
      }

      const cityId = cityByName.get((row.city ?? '').toLowerCase());
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
          gender: gender as Gender,
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
          marketingOptIn: row.marketingOptIn ? row.marketingOptIn.toLowerCase() === 'true' : true,
          contactMethod: (row.contactMethod as ContactMethod) ?? 'EMAIL_AND_SMS',
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
