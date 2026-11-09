/**
 * Turns the old site's database dump into the member import file.
 * Run on your own computer (it never touches a database):
 *
 *   npx tsx members-import/convert-old-members.ts <old-site.sql> [--check-domains] [--exclude <file>]
 *
 * Writes, in members-import/data/ (kept out of git: it's people's details):
 *   members.csv   the import file, for members-import/import-members.ts
 *   skipped.csv   everyone left out, with the reason
 *   summary.txt   the counts
 *
 * --check-domains  asks the internet's address book (DNS) whether each email
 *                  domain can receive mail at all, and leaves out addresses
 *                  whose domain can't: they would certainly bounce. A domain
 *                  whose DNS gives no answer is asked again on the next run,
 *                  and counts as unable to receive mail if it fails again
 *                  (a mail server sending to it would fail the same way).
 *                  Answers are kept in data/domains.json, so a re-run is quick.
 * --exclude <file> leaves out every address listed in the file (one per line,
 *                  or a CSV whose rows contain the address), e.g. the
 *                  "undeliverable" ones from an email-checking service.
 *
 * Who is left out, and how each member comes across: members-import/oldSite.ts.
 */

import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { promises as dns } from 'dns';
import path from 'path';
import readline from 'readline';
import { csvCell } from '../src/lib/csv';
import { mapOldMember, parseInsertValues, IMPORT_FILE_COLUMNS, type ImportFileRow } from './oldSite';

const DATA = path.join(__dirname, 'data');
const MEMBERS = 'tblFastMatchMembers';
const LOCATIONS = 'tblFastMatchLocations';

async function readTables(file: string) {
  const columns: Record<string, string[]> = {};
  const rows: Record<string, (string | null)[][]> = { [MEMBERS]: [], [LOCATIONS]: [] };
  let creating: string | null = null;
  const lines = readline.createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.startsWith('CREATE TABLE `')) {
      const table = line.split('`')[1];
      creating = table in rows ? table : null;
      if (creating) columns[creating] = [];
    } else if (creating) {
      if (line.startsWith(')')) creating = null;
      else {
        const col = /^\s+`(\w+)`/.exec(line);
        if (col) columns[creating].push(col[1]);
      }
    } else if (line.startsWith('INSERT INTO `')) {
      const table = line.split('`')[1];
      if (table in rows) rows[table].push(...parseInsertValues(line, line.indexOf(' VALUES ') + 8));
    }
  }
  const asObjects = (t: string) => rows[t].map((r) => Object.fromEntries(columns[t].map((c, i) => [c, r[i] ?? null])));
  return { members: asObjects(MEMBERS), locations: asObjects(LOCATIONS) };
}

/** Whether a domain can receive mail: true, false, or null when DNS didn't answer (kept, as it may be fine). */
async function receivesMail(domain: string): Promise<boolean | null> {
  const noSuch = (e: unknown) => ['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes((e as { code?: string }).code ?? '');
  try {
    const mx = await dns.resolveMx(domain);
    // A "null MX" (a single empty host) says the domain takes no mail.
    return mx.some((r) => r.exchange && r.exchange !== '.');
  } catch (e) {
    if (!noSuch(e)) return null;
  }
  // No MX record: mail goes to the domain's own address, if it has one.
  for (const lookup of [dns.resolve4, dns.resolve6]) {
    try {
      if ((await lookup(domain)).length) return true;
    } catch (e) {
      if (!noSuch(e)) return null;
    }
  }
  return false;
}

/** true / false, or how many runs DNS gave no answer (asked again next run). */
type DomainAnswer = boolean | number;

async function checkDomains(domains: string[]): Promise<Map<string, boolean | null>> {
  const cacheFile = path.join(DATA, 'domains.json');
  const cache: Record<string, DomainAnswer> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  const todo = domains.filter((d) => typeof cache[d] !== 'boolean');
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < todo.length) {
      const d = todo[next++];
      const ok = await receivesMail(d);
      if (ok !== null) cache[d] = ok;
      else {
        // No answer twice, on separate runs: as good as no domain.
        const tries = (typeof cache[d] === 'number' ? (cache[d] as number) : 0) + 1;
        cache[d] = tries >= 2 ? false : tries;
      }
      if (++done % 500 === 0) console.log(`  checked ${done} of ${todo.length} domains`);
    }
  }
  await Promise.all(Array.from({ length: 25 }, worker));
  writeFileSync(cacheFile, JSON.stringify(cache));
  return new Map(domains.map((d) => [d, typeof cache[d] === 'boolean' ? (cache[d] as boolean) : null]));
}

function readExcludeList(file: string): Set<string> {
  const found = readFileSync(file, 'utf8').match(/[^\s,;"'<>]+@[^\s,;"'<>]+/g) ?? [];
  return new Set(found.map((e) => e.toLowerCase()));
}

async function main() {
  const args = process.argv.slice(2);
  let file: string | undefined;
  let exclude: Set<string> | null = null;
  let checkDomainsToo = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check-domains') checkDomainsToo = true;
    else if (args[i] === '--exclude') exclude = readExcludeList(args[++i]);
    else file = args[i];
  }
  if (!file) {
    console.error('Usage: npx tsx members-import/convert-old-members.ts <old-site.sql> [--check-domains] [--exclude <file>]');
    process.exit(1);
  }
  mkdirSync(DATA, { recursive: true });

  console.log(`Reading ${file}…`);
  const { members, locations } = await readTables(file);
  const locationTitle = new Map(locations.map((l) => [l.locationId, l.title]));
  console.log(`${members.length} members on the old site.`);

  const kept: ImportFileRow[] = [];
  const skipped: { oldMemberId: string; name: string; email: string; reason: string }[] = [];
  const skip = (m: Record<string, string | null>, reason: string) =>
    skipped.push({ oldMemberId: m.memberId ?? '', name: [m.firstName, m.lastName].filter(Boolean).join(' '), email: m.email ?? '', reason });
  const seen = new Set<string>();
  for (const m of members) {
    const result = mapOldMember(m, locationTitle.get(m.locationId) ?? null);
    if ('skip' in result) { skip(m, result.skip); continue; }
    const key = result.row.email.toLowerCase();
    if (seen.has(key)) { skip(m, 'Same email address as another old member'); continue; }
    if (exclude?.has(key)) { skip(m, 'On the exclude list'); continue; }
    seen.add(key);
    kept.push(result.row);
  }

  let rows = kept;
  let unanswered: string[] = [];
  if (checkDomainsToo) {
    const domains = [...new Set(kept.map((r) => r.email.split('@').pop()!.toLowerCase()))];
    console.log(`Checking ${domains.length} email domains…`);
    const ok = await checkDomains(domains);
    unanswered = domains.filter((d) => ok.get(d) === null);
    rows = kept.filter((r) => {
      if (ok.get(r.email.split('@').pop()!.toLowerCase()) !== false) return true;
      skipped.push({ oldMemberId: r.oldMemberId, name: r.name, email: r.email, reason: "The email's domain can't receive mail" });
      return false;
    });
  }

  const line = (cells: unknown[]) => cells.map(csvCell).join(',');
  writeFileSync(path.join(DATA, 'members.csv'), [line(IMPORT_FILE_COLUMNS), ...rows.map((r) => line(IMPORT_FILE_COLUMNS.map((c) => r[c])))].join('\r\n') + '\r\n');
  writeFileSync(path.join(DATA, 'skipped.csv'), [line(['oldMemberId', 'name', 'email', 'reason']), ...skipped.map((s) => line([s.oldMemberId, s.name, s.email, s.reason]))].join('\r\n') + '\r\n');

  const count = <T>(list: T[], key: (x: T) => string) => {
    const tally = new Map<string, number>();
    for (const x of list) tally.set(key(x), (tally.get(key(x)) ?? 0) + 1);
    return [...tally].sort((a, b) => b[1] - a[1]);
  };
  const summary = [
    `Old site members: ${members.length}`,
    `To import: ${rows.length}`,
    `Left out: ${skipped.length}`,
    ...count(skipped, (s) => s.reason).map(([r, n]) => `  ${r}: ${n}`),
    '',
    'Of those to import:',
    `  email confirmed: ${rows.filter((r) => r.emailConfirmed === 'yes').length}, not confirmed: ${rows.filter((r) => r.emailConfirmed === 'no').length}`,
    `  with a mobile (confirmed): ${rows.filter((r) => r.mobile).length}, without one: ${rows.filter((r) => !r.mobile).length}`,
    `  contact method: ${count(rows, (r) => r.contactMethod).map(([c, n]) => `${c} ${n}`).join(', ')}`,
    `  city: ${count(rows, (r) => r.city || '(none)').slice(0, 12).map(([c, n]) => `${c} ${n}`).join(', ')}, …`,
    `  joined date from the old site: ${rows.filter((r) => r.joined).length}, none (import day): ${rows.filter((r) => !r.joined).length}`,
    ...(unanswered.length ? ['', `Domains DNS didn't answer for (kept for now; run again to ask them again): ${unanswered.length}`] : []),
  ].join('\n');
  writeFileSync(path.join(DATA, 'summary.txt'), summary + '\n');
  console.log('\n' + summary + `\n\nWritten to ${DATA}: members.csv, skipped.csv, summary.txt`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
