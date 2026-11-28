/**
 * A list of blast recipients who missed out, as "sendId,memberId" lines (a
 * header line is allowed), for src/scripts/recordMissedRecipients.ts. Both
 * are database ids (letters and digits); anything else is counted as bad and
 * left out, so a stray line can't become a query.
 */
export function parseMissedList(text: string): { bySend: Map<string, string[]>; bad: number } {
  const bySend = new Map<string, string[]>();
  let bad = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^sendid\s*,\s*memberid$/i.test(line)) continue;
    const m = line.match(/^([a-z0-9]{10,40})\s*,\s*([a-z0-9]{10,40})$/i);
    if (!m) { bad++; continue; }
    const list = bySend.get(m[1]) ?? [];
    if (!list.includes(m[2])) list.push(m[2]);
    bySend.set(m[1], list);
  }
  return { bySend, bad };
}
