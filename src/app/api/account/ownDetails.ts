import type { Member } from '@prisma/client';

/**
 * What a signed-in member is sent about their own account, by /api/auth/me
 * and /api/account/profile: only the fields the pages use. These answers used
 * to be the whole account row minus the password hash and the mobile code,
 * so anything added to the row later (a payment reference, a bounce report,
 * internal flags) went out with them too.
 *
 * Who reads them: the account pages (My account, Edit profile, Finish setting
 * up, Unsubscribe), verify-mobile (mobileVerificationExpires), verify-email,
 * the event page and check-in (name, email, mobile, dateOfBirth, gender, the
 * three setup flags), the events list (dateOfBirth, cityId) and the admin's
 * test-send box. isAdmin: My account hides the offers rows for staff.
 */
export const OWN_DETAILS_FIELDS = [
  'id',
  'name',
  'email',
  'mobile',
  'gender',
  'dateOfBirth',
  'cityId',
  'emailVerified',
  'mobileVerified',
  'mobileVerificationExpires',
  'agreedTerms',
  'marketingOptIn',
  'passwordSetByAdmin',
  'isAdmin',
] as const satisfies readonly (keyof Member)[];

export type OwnDetails = Pick<Member, (typeof OWN_DETAILS_FIELDS)[number]>;

/** The member's own details, as sent to their browser. */
export function ownDetails(member: Member): OwnDetails {
  return Object.fromEntries(OWN_DETAILS_FIELDS.map((k) => [k, member[k]])) as OwnDetails;
}
