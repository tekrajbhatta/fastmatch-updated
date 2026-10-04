import { csvCell } from './csv';

/**
 * Reading one row of the old site's member export (src/scripts/importMembers.ts).
 * Values are accepted in any capitals and with spaces ("Email and SMS",
 * "email_and_sms"); a blank optional value gets its default; anything else
 * unrecognised is reported, never guessed at. Rows used to be skipped for a
 * blank contact method, and an offers value of "Yes" or "1" counted as no.
 */

export type ImportContactMethod = 'EMAIL_AND_SMS' | 'EMAIL' | 'SMS' | 'DO_NOT_CONTACT';
const CONTACT_METHODS: ImportContactMethod[] = ['EMAIL_AND_SMS', 'EMAIL', 'SMS', 'DO_NOT_CONTACT'];

/** Contact method; blank is the default, "Email and SMS". Null: not recognised. */
export function importContactMethod(raw: string | null | undefined): ImportContactMethod | null {
  const v = (raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[\s_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (v === '') return 'EMAIL_AND_SMS';
  return CONTACT_METHODS.find((m) => m === v) ?? null;
}

/** "Receive special offers"; blank is the default, yes. Null: not recognised. */
export function importOptIn(raw: string | null | undefined): boolean | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === '') return true;
  if (['yes', 'y', 'true', '1'].includes(v)) return true;
  if (['no', 'n', 'false', '0'].includes(v)) return false;
  return null;
}

export function importGender(raw: string | null | undefined): 'MALE' | 'FEMALE' | null {
  const v = (raw ?? '').trim().toUpperCase();
  if (v === 'MALE' || v === 'M') return 'MALE';
  if (v === 'FEMALE' || v === 'F') return 'FEMALE';
  return null;
}

/** A city name for matching the city list: any capitals, extra spaces ignored. */
export function cityKey(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * A cell as typed. The skipped-rows report (below) puts an apostrophe before
 * text starting with = + - @ so spreadsheets don't run it as a formula; it's
 * taken off again here, so a fixed-up report can be imported as it is.
 */
export function importCell(raw: string | null | undefined): string {
  const v = raw ?? '';
  return /^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v;
}

/** Every skipped row, with its original columns and the reason, as a CSV file. */
export function skippedRowsCsv(rows: { row: Record<string, string | undefined>; reason: string }[]): string {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r.row)))].filter((c) => c !== 'reason');
  const line = (cells: unknown[]) => cells.map(csvCell).join(',');
  return [line([...columns, 'reason']), ...rows.map(({ row, reason }) => line([...columns.map((c) => row[c] ?? ''), reason]))].join('\r\n') + '\r\n';
}
