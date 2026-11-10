/**
 * Australian mobiles only (Gil, Q21: "This site will only run here in
 * Australia"). Any number used to be accepted, in any format. New entries
 * are checked — signing up, adding a member, a friend's details — and so is a
 * changed number; numbers already saved are left alone (Q21 default).
 *
 * Accepted however it's written, as long as it's an Australian mobile:
 * "0412 345 678", "0412-345-678", "+61 412 345 678", "61412345678",
 * "412 345 678" — the same forms the SMS sender turns into 61XXXXXXXXX
 * (src/lib/sms/send.ts). Two members may share a number (Gil).
 *
 * No Prisma import: the forms use it in the browser too.
 */
export const AU_MOBILE_MESSAGE = 'Please enter an Australian mobile number, like 0412 345 678.';

/** The number as 61XXXXXXXXX, or null if it isn't an Australian mobile. */
export function australianMobile(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!/^\+?[\d\s().-]+$/.test(s)) return null;
  const digits = s.replace(/\D/g, '');
  if (/^04\d{8}$/.test(digits)) return `61${digits.slice(1)}`;
  if (/^614\d{8}$/.test(digits)) return digits;
  if (/^4\d{8}$/.test(digits)) return `61${digits}`;
  return null;
}

export function isAustralianMobile(raw: string | null | undefined): boolean {
  return australianMobile(raw) !== null;
}

/**
 * The same number, however each is written ("0412 345 678" and
 * "+61412345678"), so re-saving a form unchanged isn't a "new" number.
 *
 * Only two Australian mobiles are compared by their digits. Anything else
 * (an old overseas number already saved) is the same only when written
 * exactly the same, and something with no digits at all is never "the same"
 * as anything: comparing digits alone used to make "call me" equal to an
 * empty number (members imported without one), so it was saved as their
 * mobile without being checked as a new number.
 */
export function sameMobile(a: string | null | undefined, b: string | null | undefined): boolean {
  const sa = (a ?? '').trim();
  const sb = (b ?? '').trim();
  if (!/\d/.test(sa) || !/\d/.test(sb)) return false;
  const ka = australianMobile(sa);
  const kb = australianMobile(sb);
  if (ka && kb) return ka === kb;
  return sa === sb;
}
