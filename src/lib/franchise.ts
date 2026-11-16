import { z } from 'zod';
import { PASSWORD_MAX, PASSWORD_TOO_LONG } from './tokens';
import { isAustralianMobile, AU_MOBILE_MESSAGE } from './mobile';
import { discountValidity, formatDiscountDay } from './discountDates';

/**
 * Franchises (Gil, Nov; his answers 15 Nov). A franchisee runs FastMatch in
 * one or more locations ("we switch on those locations for them"). Gil makes
 * their login on the Franchises page: name, email, mobile, location(s),
 * password, and the agreement's dates.
 *
 * Their login is a Member row with isFranchisee (so logging in, "Forgot
 * password?" and My account work as for anyone), but they're staff, not a
 * member: they're left out of the members list, blasts and reports, and
 * can't book. They get Gil's admin limited to their locations: Events (with
 * bookings, but not matches, which are worked out by themselves), Members
 * (search only), Venues, Discount codes, Reports and My account
 * (src/lib/staff.ts has the rules).
 *
 * Gil's answers:
 *   - payments go to FastMatch's Stripe; they can cancel their own events,
 *     and Gil is texted and emailed when they do;
 *   - Gil's codes (FMDC10, affiliates') work on their events; theirs only
 *     work in their locations;
 *   - no login outside the agreement's dates; their events and venues stay;
 *     their reports only cover the agreement's dates;
 *   - deleting a franchisee only removes the login: events, venues and codes
 *     belong to the location and stay;
 *   - they use Gil's event types (he adds new ones when asked);
 *   - they see and manage everything already in their locations;
 *   - member emails about their events give their email to write to;
 *   - no hosts for now; blasts stay Gil's (they tell him what to send).
 */

type FranchiseDates = { isFranchisee: boolean; franchiseFrom: Date | null; franchiseTill: Date | null };

/**
 * Why a franchisee can't use their login right now, or null when they can
 * (and always null for anyone who isn't a franchisee).
 */
export function franchiseLockedReason(member: FranchiseDates, now: Date = new Date()): string | null {
  if (!member.isFranchisee) return null;
  const { franchiseFrom: from, franchiseTill: till } = member;
  if (!from || !till) return 'Your franchise login isn’t set up yet. Please contact FastMatch.';
  if (now < from) return `Your franchise login starts on ${formatDiscountDay(from)}. Please contact FastMatch if you need it sooner.`;
  if (now > till) return `Your franchise agreement ended on ${formatDiscountDay(till)}, so this login no longer works. Please contact FastMatch.`;
  return null;
}

/** The Franchises page's form. The password is needed for a new franchisee, and only when changing it otherwise. */
export const franchiseInputSchema = z.object({
  name: z.string().trim().min(1, 'Please enter the franchisee’s name.').max(100, 'Please keep the name to 100 characters.'),
  email: z.string().trim().max(254, 'Please enter a valid email address.').email('Please enter a valid email address.'),
  mobile: z.string().trim().min(1, 'Please enter a mobile number.').max(30, AU_MOBILE_MESSAGE).refine(isAustralianMobile, AU_MOBILE_MESSAGE),
  cityIds: z.array(z.string().min(1).max(100)).min(1, 'Please choose at least one location.').max(50),
  password: z.string().max(PASSWORD_MAX, PASSWORD_TOO_LONG).optional().transform((v) => v || undefined)
    .refine((v) => v === undefined || v.length >= 8, 'The password must be at least 8 characters.'),
  // "YYYY-MM-DD": whole days in Sydney, like a discount code's dates.
  agreementFrom: z.string(),
  agreementTill: z.string(),
});
export type FranchiseInput = z.infer<typeof franchiseInputSchema>;

/** The agreement's first and last moments, or the problem with the dates. */
export function agreementDates(input: Pick<FranchiseInput, 'agreementFrom' | 'agreementTill'>):
  | { ok: true; franchiseFrom: Date; franchiseTill: Date }
  | { ok: false; error: string } {
  const range = discountValidity(input.agreementFrom, input.agreementTill);
  if (!range) return { ok: false, error: 'Please choose the agreement’s "From" and "Till" dates.' };
  if (range.validTo < range.validFrom) return { ok: false, error: '"Till" can’t be before "From".' };
  return { ok: true, franchiseFrom: range.validFrom, franchiseTill: range.validTo };
}

/**
 * Do two agreements share a day? Each location has one franchisee at a
 * time, so member emails about its events, and its reports, have one owner.
 */
export function agreementsOverlap(a: { from: Date; till: Date }, b: { from: Date; till: Date }): boolean {
  return a.from <= b.till && b.from <= a.till;
}

/**
 * The franchisee's row needs a gender and date of birth, as every account
 * does. These are placeholders: nothing shows them, since franchisees are
 * left out of everything members are counted in.
 */
export const FRANCHISE_PLACEHOLDERS = { gender: 'FEMALE' as const, dateOfBirth: new Date('1970-01-01T00:00:00.000Z') };

export { FRANCHISE_CANT_BOOK, FRANCHISE_DETAILS_BY_GIL } from './franchiseText';
