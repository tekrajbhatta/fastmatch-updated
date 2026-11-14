import { z } from 'zod';
import { checkDiscountInput, discountAmountProblem } from './discountInput';

/**
 * Affiliates (Gil, Nov): partners who promote FastMatch events. Each
 * promotion is a discount code linked to the affiliate, with a commission:
 * the affiliate's customers type the code when they book (RSVP10: $10 or
 * 10% off), and each booking made with it earns the affiliate that % of the
 * event's cost (20% of a $50 event: $10).
 *
 * Gil's rules (his answers, 14 Nov):
 *   - the commission is a % of the event's cost, not of what was paid;
 *   - one commission per booking that used the code: the booker's own place
 *     (the code only discounts theirs; friends get the group discount);
 *   - a code works once per member, as every code does: no discount, no
 *     commission the second time;
 *   - a promotion that has been used can't be deleted (it would leave the
 *     report): change its end date to stop it;
 *   - each booking keeps the commission it was paid with (see Booking);
 *   - none for a refunded or cancelled booking, or a cancelled event;
 *   - commissions come off profit in the reports;
 *   - an affiliate code works for every event (no event or type limit).
 *
 * No imports beyond zod and the discount rules: the Affiliates page uses it.
 */

/** The commission on one booking: the % of the event's cost, to the cent. */
export function commissionFor(eventCost: number, percent: number): number {
  return Math.round(eventCost * percent) / 100;
}

/** The Affiliates page's form: Gil's fields. */
export const affiliateInputSchema = z.object({
  affiliateName: z.string().trim().min(1, 'Please enter the affiliate’s name.').max(100, 'Please use a shorter name.'),
  commissionPercent: z.number({ invalid_type_error: 'Please enter the commission (%).' })
    .finite().gt(0, 'The commission must be more than 0%.').max(100, 'The commission can’t be more than 100%.'),
  code: z.string().trim().min(1, 'Please enter the code.').max(50, 'Please use a shorter code.').transform((s) => s.toUpperCase()),
  // "Affiliate discount": percentage off or dollar off (Gil).
  type: z.enum(['PERCENT_OFF', 'FIXED_REDUCTION']),
  amount: z.number().nullable().optional(),
  validFrom: z.string(),
  validTo: z.string(),
});
export type AffiliateInput = z.infer<typeof affiliateInputSchema>;

/** The checked promotion: the affiliate's name and commission, and its discount code's fields (never limited to an event). */
export function checkAffiliateInput(input: AffiliateInput) {
  const amountProblem = discountAmountProblem(input.type, input.amount);
  if (amountProblem) return { ok: false as const, error: amountProblem };
  const code = checkDiscountInput({ code: input.code, type: input.type, amount: input.amount, validFrom: input.validFrom, validTo: input.validTo, scopeEventId: null, scopeThemeId: null });
  if (!code.ok) return code;
  return {
    ok: true as const,
    affiliateName: input.affiliateName,
    commissionPercent: Math.round(input.commissionPercent * 100) / 100,
    code: { ...code.data, scopeEventId: null, scopeThemeId: null },
  };
}

export const PROMOTION_USED = 'This promotion has been used, so it can’t be deleted: its bookings would leave the commission report. To stop it, change its "Promotion till" date.';
export const EDIT_ON_AFFILIATES_PAGE = 'This is an affiliate’s promotion: change it on the Affiliates page.';
