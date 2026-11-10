/**
 * One-off, for the move from 5minutedating.com.au to fastmatch.com.au: rewrites
 * the site addresses that were SAVED with the old address (uploaded pictures
 * of events, venues and blasts, blasts' Book Now links, and the old address
 * typed into an event's, a venue's or a blast's text). Everything else
 * already follows APP_URL.
 *
 * Run it once APP_URL is the new address (and the old one redirects to it).
 * Safe to run again: a second run finds nothing left to change.
 *
 * Usage, on the server (as the site's own user, like the other scripts):
 *   # 1. Preview: always run this first. Changes nothing.
 *   npm run rewrite-site-address
 *
 *   # 2. Rewrite
 *   npm run rewrite-site-address -- --confirm
 *
 * Only the columns in ADDRESS_COLUMNS (src/lib/siteAddress.ts) are changed,
 * all in one transaction, and their rows' "last updated" times are left as
 * they were. Any other column that mentions the old address (a member's email
 * address, say) is listed at the end and left alone.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ADDRESS_COLUMNS, NEW_ORIGIN, OLD_HOST, rewriteOldAddress } from '../lib/siteAddress';

/** Table and column names go into the SQL itself, so only plain names are accepted. */
function ident(name: string): Prisma.Sql {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Unexpected table or column name: ${name}`);
  return Prisma.raw(`\`${name}\``);
}

/** Matches every spelling MySQL compares case-insensitively ("5minutedating" in any capitals). */
const LIKE_OLD = '%5minutedating%';

/** A short piece of the text around the old address, on one line. */
function snippet(text: string): string {
  const flat = text.replace(/\s+/g, ' ');
  const at = flat.toLowerCase().indexOf('5minutedating');
  const start = Math.max(0, at - 40);
  const piece = flat.slice(start, start + 110);
  return `${start > 0 ? '…' : ''}${piece}${start + 110 < flat.length ? '…' : ''}`;
}

/** A short piece of the rewritten text, at the same place. */
function snippetAfter(before: string, after: string): string {
  const flat = after.replace(/\s+/g, ' ');
  const at = before.replace(/\s+/g, ' ').toLowerCase().indexOf('5minutedating');
  const start = Math.max(0, at - 40);
  const piece = flat.slice(start, start + 110);
  return `${start > 0 ? '…' : ''}${piece}${start + 110 < flat.length ? '…' : ''}`;
}

async function main() {
  const confirm = process.argv.includes('--confirm');
  console.log(`${confirm ? 'REWRITING' : 'PREVIEW (nothing will change)'}: ${OLD_HOST} -> ${NEW_ORIGIN}\n`);

  const updates: Prisma.PrismaPromise<number>[] = [];
  let rowsToChange = 0;
  let valuesToChange = 0;
  const leftAsIs: string[] = [];

  for (const { table, columns } of ADDRESS_COLUMNS) {
    const where = Prisma.join(columns.map((c) => Prisma.sql`${ident(c)} LIKE ${LIKE_OLD}`), ' OR ');
    const rows = await prisma.$queryRaw<Record<string, string | null>[]>`
      SELECT ${ident('id')}, ${Prisma.join(columns.map(ident))} FROM ${ident(table)} WHERE ${where}`;

    let tableRows = 0;
    for (const row of rows) {
      const changes: { column: string; before: string; after: string }[] = [];
      for (const column of columns) {
        const before = row[column];
        if (typeof before !== 'string' || !before.toLowerCase().includes('5minutedating')) continue;
        const after = rewriteOldAddress(before);
        if (after === before) {
          // Mentions the old name in a form that is left alone (an email address).
          leftAsIs.push(`${table}.${column} (id ${row.id}): ${snippet(before)}`);
          continue;
        }
        changes.push({ column, before, after });
      }
      if (!changes.length) continue;

      if (tableRows === 0) console.log(`${table}:`);
      tableRows++;
      rowsToChange++;
      valuesToChange += changes.length;
      console.log(`  id ${row.id}`);
      for (const ch of changes) {
        console.log(`    ${ch.column}:`);
        console.log(`      before: ${snippet(ch.before)}`);
        console.log(`      after:  ${snippetAfter(ch.before, ch.after)}`);
      }
      const sets = Prisma.join(changes.map((ch) => Prisma.sql`${ident(ch.column)} = ${ch.after}`), ', ');
      updates.push(prisma.$executeRaw`UPDATE ${ident(table)} SET ${sets} WHERE ${ident('id')} = ${row.id}`);
    }
    if (tableRows === 0) console.log(`${table}: nothing to change`);
    console.log('');
  }

  // Anywhere else the old address appears: reported, never changed.
  const listed = new Set(ADDRESS_COLUMNS.flatMap(({ table, columns }) => columns.map((c) => `${table}.${c}`)));
  const textColumns = await prisma.$queryRaw<{ TABLE_NAME: string; COLUMN_NAME: string }[]>`
    SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND DATA_TYPE IN ('char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext', 'json')
      AND TABLE_NAME <> '_prisma_migrations'`;
  const elsewhere: string[] = [];
  for (const { TABLE_NAME: table, COLUMN_NAME: column } of textColumns) {
    if (listed.has(`${table}.${column}`)) continue;
    const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM ${ident(table)} WHERE CAST(${ident(column)} AS CHAR) LIKE ${LIKE_OLD}`;
    if (Number(n) > 0) elsewhere.push(`${table}.${column}: ${n} row(s)`);
  }

  if (leftAsIs.length) {
    console.log('Mentions left as they are (an email address or part of a longer name):');
    for (const line of leftAsIs) console.log(`  ${line}`);
    console.log('');
  }
  if (elsewhere.length) {
    console.log('Other columns that mention the old address (never changed by this script; check them by hand):');
    for (const line of elsewhere) console.log(`  ${line}`);
    console.log('');
  }

  if (!rowsToChange) {
    console.log('Nothing to change: no saved address uses the old site address.');
    return;
  }
  if (!confirm) {
    console.log(`${rowsToChange} row(s), ${valuesToChange} value(s) would change. Preview only. Re-run with --confirm to rewrite.`);
    return;
  }

  // All or nothing: a failure part-way leaves every row as it was.
  await prisma.$transaction(updates);
  console.log(`Done: ${rowsToChange} row(s), ${valuesToChange} value(s) rewritten to ${NEW_ORIGIN}. Run it again to check: it should find nothing.`);
}

main()
  .catch((err) => {
    console.error('rewrite-site-address failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
