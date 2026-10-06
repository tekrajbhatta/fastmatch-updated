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
 * Numbers that aren't Australian mobiles are compared digit by digit.
 */
export function sameMobile(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = australianMobile(a) ?? (a ?? '').replace(/\D/g, '');
  const kb = australianMobile(b) ?? (b ?? '').replace(/\D/g, '');
  return ka === kb;
}
