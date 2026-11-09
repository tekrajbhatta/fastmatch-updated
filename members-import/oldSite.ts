/**
 * The old site's members (tblFastMatchMembers in its database dump), turned
 * into rows of the import file (members-import/import-members.ts). Decided
 * with the user, 9 Nov:
 *
 *   - Left out: members deleted on the old site, addresses that bounced there,
 *     and any address that isn't a valid email address (Gil's blasts must not
 *     bounce). Old passwords aren't carried over.
 *   - Everyone else comes across with what they have: no mobile or no city of
 *     ours is fine (they add them later in Edit profile).
 *   - Event news and offers: on, except for members who unsubscribed on the
 *     old site ("unsub"): off, as Australia's Spam Act requires an
 *     unsubscribe to be honoured (the user, 9 Nov).
 *   - Email confirmed only where the old site had it confirmed ("conf"), or
 *     the member later unsubscribed there ("unsub": the address worked).
 *   - Contact method as they chose it there.
 *   - Joined: when they registered there, on Sydney's clock.
 */

import { EMAIL_RE, parseDateOfBirth } from '../src/lib/friendBooking';
import { importMobile } from '../src/lib/importRow';

/** One row of the import file, as members-import/import-members.ts reads it. */
export interface ImportFileRow {
  name: string;
  gender: string;
  email: string;
  dateOfBirth: string;
  mobile: string;
  city: string;
  emailConfirmed: string;
  mobileConfirmed: string;
  marketingOptIn: string;
  contactMethod: string;
  joined: string;
  oldMemberId: string;
}

export const IMPORT_FILE_COLUMNS: (keyof ImportFileRow)[] = [
  'name', 'gender', 'email', 'dateOfBirth', 'mobile', 'city', 'emailConfirmed', 'mobileConfirmed', 'marketingOptIn', 'contactMethod', 'joined', 'oldMemberId',
];

type OldRow = Record<string, string | null>;

const CONTACT: Record<string, string> = { emailsms: 'Email and SMS', email: 'Email', sms: 'SMS', none: 'Do not contact' };

/** Names as the old site stored them, now and then with &amp; and the like. */
function plainText(v: string | null): string {
  return (v ?? '')
    .replace(/&amp;/g, '&').replace(/&#0*39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .trim().replace(/\s+/g, ' ');
}

/** The import row for one old member, or why they're left out. */
export function mapOldMember(m: OldRow, locationTitle: string | null): { row: ImportFileRow } | { skip: string } {
  if (m.emailConfirm === 'del') return { skip: 'Deleted on the old site' };
  if (m.bounce === '1') return { skip: 'Email bounced on the old site' };
  const email = (m.email ?? '').trim();
  if (!email) return { skip: 'No email address' };
  if (!EMAIL_RE.test(email)) return { skip: 'Not a valid email address' };
  const name = [plainText(m.firstName), plainText(m.lastName)].filter(Boolean).join(' ');
  if (!name) return { skip: 'No name' };
  if (m.gender !== 'male' && m.gender !== 'female') return { skip: 'No gender' };
  if (!parseDateOfBirth(m.dob ?? '')) return { skip: 'No valid date of birth' };

  const mobile = importMobile(m.mobile);
  const city = (locationTitle ?? '').trim();
  return {
    row: {
      name,
      gender: m.gender,
      email,
      dateOfBirth: m.dob ?? '',
      mobile,
      // "Unknown" on the old site: no city.
      city: city.toLowerCase() === 'unknown' ? '' : city,
      emailConfirmed: m.emailConfirm === 'conf' || m.emailConfirm === 'unsub' ? 'yes' : 'no',
      // The old site texted these numbers; one that isn't an Australian
      // mobile is left out above (it can't be texted).
      mobileConfirmed: mobile ? 'yes' : 'no',
      // An unsubscribe on the old site still stands (Spam Act).
      marketingOptIn: m.emailConfirm === 'unsub' ? 'no' : 'yes',
      contactMethod: CONTACT[m.contactMethod ?? 'emailsms'] ?? 'Email and SMS',
      joined: (m.registered ?? '').startsWith('0000') ? '' : (m.registered ?? ''),
      oldMemberId: m.memberId ?? '',
    },
  };
}

/**
 * The VALUES of one mysqldump INSERT line, from `start`: each row's values as
 * text, or null for NULL. Read-only; handles quotes and backslash escapes.
 */
export function parseInsertValues(s: string, start: number): (string | null)[][] {
  const rows: (string | null)[][] = [];
  let i = start;
  const n = s.length;
  while (i < n) {
    while (i < n && ' ,\n\r\t'.includes(s[i])) i++;
    if (i >= n || s[i] === ';') break;
    if (s[i] !== '(') throw new Error(`Unexpected "${s.slice(i, i + 20)}" in the dump`);
    i++;
    const row: (string | null)[] = [];
    for (;;) {
      while (s[i] === ' ') i++;
      if (s[i] === "'") {
        i++;
        let buf = '';
        for (;;) {
          const c = s[i];
          if (c === '\\') {
            const nx = s[i + 1];
            buf += ({ n: '\n', r: '\r', t: '\t', '0': '\0' } as Record<string, string>)[nx] ?? nx;
            i += 2;
          } else if (c === "'") {
            if (s[i + 1] === "'") { buf += "'"; i += 2; } else { i++; break; }
          } else { buf += c; i++; }
        }
        row.push(buf);
      } else {
        let j = i;
        while (s[j] !== ',' && s[j] !== ')') j++;
        const tok = s.slice(i, j).trim();
        i = j;
        row.push(tok === 'NULL' ? null : tok);
      }
      if (s[i] === ',') { i++; continue; }
      if (s[i] === ')') { i++; break; }
    }
    rows.push(row);
  }
  return rows;
}
