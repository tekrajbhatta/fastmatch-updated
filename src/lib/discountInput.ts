import { z } from 'zod';
import { discountValidity } from './discountDates';

/**
 * What the admin's discount code form sends, checked the same way whether a
 * code is being created or edited. Editing used to pass its input straight to
 * the database, so a code could become "null% off", over 100% or negative,
 * and clearing the amount kept the old one — and members booking with it got
 * "Something went wrong".
 */
export const discountInputSchema = z.object({
  code: z.string().trim().min(1, 'Please enter the code.').max(50, 'Please use a shorter code.').transform((s) => s.toUpperCase()),
  type: z.enum(['PERCENT_OFF', 'FIXED_REDUCTION', 'FREE']),
  amount: z.number().nullable().optional(),
  scopeThemeId: z.string().nullable().optional(),
  // "Event": null or empty = All events; otherwise the one event it works for.
  scopeEventId: z.string().nullable().optional().transform((v) => v || null),
  // "YYYY-MM-DD": whole days in Sydney (src/lib/discountDates.ts).
  validFrom: z.string(),
  validTo: z.string(),
});

export type DiscountInput = z.infer<typeof discountInputSchema>;

/**
 * The amount's rules: Percent off 1 to 100, Fixed reduction more than $0,
 * Free has none. Returns the problem to show, or null.
 */
export function discountAmountProblem(type: DiscountInput['type'], amount: number | null | undefined): string | null {
  if (type === 'FREE') return null;
  if (amount == null || !Number.isFinite(amount)) {
    return type === 'PERCENT_OFF' ? 'Please enter the percentage off (1 to 100).' : 'Please enter the amount off, in dollars.';
  }
  if (type === 'PERCENT_OFF' && (amount < 1 || amount > 100)) return 'Percent off must be between 1 and 100.';
  if (type === 'FIXED_REDUCTION' && amount <= 0) return 'The amount off must be more than $0.';
  return null;
}

/**
 * The checked fields ready for the database, or the first problem with them.
 * A Free code stores no amount.
 */
export function checkDiscountInput(input: DiscountInput):
  | { ok: true; data: { code: string; type: DiscountInput['type']; amount: number | null; scopeEventId: string | null; validFrom: Date; validTo: Date } }
  | { ok: false; error: string } {
  const amountProblem = discountAmountProblem(input.type, input.amount);
  if (amountProblem) return { ok: false, error: amountProblem };
  const validity = discountValidity(input.validFrom, input.validTo);
  if (!validity) return { ok: false, error: 'Please choose the "Valid from" and "Valid to" dates.' };
  if (validity.validTo < validity.validFrom) return { ok: false, error: '"Valid to" can\'t be before "Valid from".' };
  return {
    ok: true,
    data: {
      code: input.code,
      type: input.type,
      amount: input.type === 'FREE' ? null : (input.amount as number),
      scopeEventId: input.scopeEventId,
      ...validity,
    },
  };
}

export const DUPLICATE_CODE = 'That code already exists.';
