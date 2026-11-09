import crypto from 'crypto';
import { csvCell } from './csv';
import { EMAIL_RE, parseDateOfBirth } from './friendBooking';
import { australianMobile } from './mobile';
import { instantFromWallTime } from './zonedTime';
import { EVENT_TIME_ZONE } from './datetime';

/**
 * Reading one row of a member import file (members-import/import-members.ts):
 * the old site's members, converted by members-import/convert-old-members.ts,
 * or any other list in the same columns. Values are accepted in any capitals
 * and with spaces ("Email and SMS", "email_and_sms"); a blank optional value
 * gets its default; anything else unrecognised is reported, never guessed at.
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

/**
 * In place of a password for an imported member: old-site passwords aren't
 * carried over (the user, 9 Nov). It can never match one (it isn't a bcrypt
 * hash: logging in treats it as no password), so the member sets one through
 * "Forgot password?", which works as for anyone. Random per member, so no two
 * accounts share it.
 */
export const IMPORTED_PASSWORD_PREFIX = '!imported:';
export const importedPasswordMarker = () => IMPORTED_PASSWORD_PREFIX + crypto.randomBytes(12).toString('hex');

/** A yes/no cell; blank is `blankDefault`. Null: not recognised. */
export function importYesNo(raw: string | null | undefined, blankDefault: boolean): boolean | null {
  const v = (raw ?? '').trim();
  return v === '' ? blankDefault : importOptIn(v);
}

/**
 * When they joined: an exact time ("2006-05-01T00:22:00.000Z"), or a date and
 * time on FastMatch's own clock, Sydney ("2006-05-01 10:22:33"). Blank (or the
 * old site's "0000-00-00"): null, so the import day is used. 'invalid' for
 * anything else, or a time still to come.
 */
export function importJoined(raw: string | null | undefined, now: Date = new Date()): Date | null | 'invalid' {
  const v = (raw ?? '').trim();
  if (v === '' || v.startsWith('0000-00-00')) return null;
  const at = /(Z|[+-]\d{2}:?\d{2})$/.test(v) ? new Date(v) : instantFromWallTime(v, EVENT_TIME_ZONE);
  if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime()) return 'invalid';
  return at;
}

/** An Australian mobile as 04XXXXXXXX, or '' for none or anything else (which can't be texted). */
export function importMobile(raw: string | null | undefined): string {
  const m = australianMobile(raw);
  return m ? `0${m.slice(2)}` : '';
}

export interface ImportedMember {
  name: string;
  email: string;
  gender: 'MALE' | 'FEMALE';
  dateOfBirth: Date;
  mobile: string;
  mobileVerified: boolean;
  cityId: string | null;
  emailVerified: boolean;
  marketingOptIn: boolean;
  contactMethod: ImportContactMethod;
  /** Null: the import day. */
  joined: Date | null;
}

export type ImportCheck =
  | { ok: true; member: ImportedMember; notes: { noMobile: boolean; mobileNotUsable: boolean; noCity: boolean } }
  | { ok: false; reason: string };

/**
 * One row, checked and read. Needs a name, a valid email address, a gender and
 * a real date of birth; everything else may be blank (the user, 9 Nov):
 *   - mobile: an Australian mobile, or none (the member adds one later, and
 *     confirms it before booking). Anything else is left out, as it can't be
 *     texted. Confirmed (mobileConfirmed) unless the row says no.
 *   - city: one of the site's, or none (chosen later in Edit profile).
 *   - emailConfirmed: blank = yes. marketingOptIn: blank = yes.
 *     contactMethod: blank = Email and SMS. joined: blank = the import day.
 */
export function checkImportRow(row: Record<string, string | undefined>, cityIdByKey: Map<string, string>, now: Date = new Date()): ImportCheck {
  const name = (row.name ?? '').trim().replace(/\s+/g, ' ');
  const email = (row.email ?? '').trim();
  if (!name) return { ok: false, reason: 'No name' };
  if (!email) return { ok: false, reason: 'No email address' };
  if (!EMAIL_RE.test(email)) return { ok: false, reason: `"${email}" isn't a valid email address` };

  const gender = importGender(row.gender);
  if (!gender) return { ok: false, reason: `Unrecognised gender "${row.gender ?? ''}" (use male or female)` };
  const dateOfBirth = parseDateOfBirth(row.dateOfBirth ?? '');
  if (!dateOfBirth) return { ok: false, reason: `Invalid date of birth "${row.dateOfBirth ?? ''}" (use YYYY-MM-DD)` };

  const contactMethod = importContactMethod(row.contactMethod);
  if (!contactMethod) return { ok: false, reason: `Unrecognised contact method "${row.contactMethod}" (use Email and SMS, Email, SMS or Do not contact)` };
  const marketingOptIn = importOptIn(row.marketingOptIn);
  if (marketingOptIn === null) return { ok: false, reason: `Unrecognised offers value "${row.marketingOptIn}" (use yes or no)` };
  const emailVerified = importYesNo(row.emailConfirmed, true);
  if (emailVerified === null) return { ok: false, reason: `Unrecognised emailConfirmed value "${row.emailConfirmed}" (use yes or no)` };
  const mobileConfirmed = importYesNo(row.mobileConfirmed, true);
  if (mobileConfirmed === null) return { ok: false, reason: `Unrecognised mobileConfirmed value "${row.mobileConfirmed}" (use yes or no)` };
  const joined = importJoined(row.joined, now);
  if (joined === 'invalid') return { ok: false, reason: `Invalid joined date "${row.joined}"` };

  const rawMobile = (row.mobile ?? '').trim();
  const mobile = importMobile(rawMobile);
  const cityId = cityIdByKey.get(cityKey(row.city)) ?? null;

  return {
    ok: true,
    member: { name, email, gender, dateOfBirth, mobile, mobileVerified: !!mobile && mobileConfirmed, cityId, emailVerified, marketingOptIn, contactMethod, joined },
    notes: { noMobile: !rawMobile, mobileNotUsable: !!rawMobile && !mobile, noCity: !cityId },
  };
}
