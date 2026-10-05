import { z } from 'zod';

/**
 * One set of rules for an event's details, used by "New event" and "Edit
 * event" — in the browser, to show each problem under its box, and again by
 * their API routes. The edit form used to check far less than the new-event
 * form (an empty maximum saved as 0, the minimum age could be above the
 * maximum, expenses couldn't be cleared), and its API passed whatever it was
 * sent straight to the database.
 *
 * No Prisma import: this runs in the browser too.
 */

const say = (message: string) => ({ required_error: message, invalid_type_error: message });

export const eventFieldsSchema = z.object({
  themeId: z.string(say('Please choose an event type.')).min(1, 'Please choose an event type.'),
  name: z.string(say('Please give the event a name.')).trim().min(1, 'Please give the event a name.').max(200, 'Please keep the name under 200 characters.'),
  description: z.string().max(20_000).nullable().optional().transform((v) => v || null),
  photoUrl: z.string().max(2_000).nullable().optional().transform((v) => v || null),
  startsAt: z.string(say('Please enter the start date and time.')).refine((v) => !Number.isNaN(Date.parse(v)), 'Please enter a valid start date and time.'),
  cityId: z.string(say('Please choose a city.')).min(1, 'Please choose a city.'),
  venueId: z.string(say('Please choose a venue.')).min(1, 'Please choose a venue.'),
  ageMin: z.number(say('Please enter the minimum age.')).int('Whole years, please.').positive('Please enter a real age.'),
  ageMax: z.number(say('Please enter the maximum age.')).int('Whole years, please.').positive('Please enter a real age.'),
  cost: z.number(say('Please enter the cost (0 if it’s free).')).min(0, 'The cost can’t be negative.'),
  maxMen: z.number(say('Please enter how many men can book.')).int('A whole number, please.').min(1, 'At least 1.'),
  maxWomen: z.number(say('Please enter how many women can book.')).int('A whole number, please.').min(1, 'At least 1.'),
  // Empty clears it.
  expenses: z.number(say('Please enter the expenses, or leave the box empty.')).min(0, 'Expenses can’t be negative.').nullable().optional(),
  visibility: z.enum(['PUBLIC', 'NOT_PUBLIC']).default('PUBLIC'),
  confirmed: z.boolean().default(false),
  fastmatchDiscounts: z.boolean().default(true),
  groupDiscounts: z.boolean().default(true),
  // Who members see and rate on the night (src/lib/ratingAudience.ts).
  ratingAudience: z.enum(['OPPOSITE_GENDER', 'EVERYONE']).default('OPPOSITE_GENDER'),
});

export const newEventSchema = eventFieldsSchema.extend({
  repeat: z
    .object({
      frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
      interval: z.number(say('Please enter how often it repeats.')).int().positive('At least 1.').default(1),
      // Generates occurrences up to and including this date, not a fixed count.
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Please choose an end date for the repeat.'),
    })
    .optional(),
});

/** An edit: any of the fields (the rest stay as they are), plus taking a copied event out of draft. */
export const eventEditSchema = eventFieldsSchema.partial().extend({ draft: z.boolean().optional() });

export type EventFields = z.infer<typeof eventFieldsSchema>;
export type NewEventInput = z.infer<typeof newEventSchema>;
export type EventEdit = z.infer<typeof eventEditSchema>;
/** Field name ("maxMen", "repeat.endDate") → what's wrong with it. */
export type EventFieldErrors = Record<string, string>;

export const CHECK_FIELDS = 'Please check the highlighted fields.';

type Checked<T> = { ok: true; data: T } | { ok: false; fieldErrors: EventFieldErrors };

function fieldErrors(error: z.ZodError): EventFieldErrors {
  const out: EventFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** Rules between fields, on the event as it will be saved. */
function crossFieldErrors(e: { ageMin: number; ageMax: number }): EventFieldErrors {
  return e.ageMin > e.ageMax ? { ageMin: 'The minimum age can’t be higher than the maximum.' } : {};
}

function check<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  body: unknown,
  current?: { ageMin: number; ageMax: number },
): Checked<T> {
  const parsed = schema.safeParse(body);
  // The ages are compared even when another box is wrong, so every problem
  // shows at once; a box's own problem comes first.
  const raw = (body && typeof body === 'object' ? body : {}) as { ageMin?: unknown; ageMax?: unknown };
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const ageMin = num(raw.ageMin) ?? current?.ageMin;
  const ageMax = num(raw.ageMax) ?? current?.ageMax;
  const errors = {
    ...(ageMin !== undefined && ageMax !== undefined ? crossFieldErrors({ ageMin, ageMax }) : {}),
    ...(parsed.success ? {} : fieldErrors(parsed.error)),
  };
  if (Object.keys(errors).length || !parsed.success) return { ok: false, fieldErrors: errors };
  return { ok: true, data: parsed.data };
}

/** A new event (or the first of a repeat series). */
export const checkNewEvent = (body: unknown) => check(newEventSchema, body);
/** The whole edit form, as the browser checks it before saving. */
export const checkEventFields = (body: unknown) => check(eventFieldsSchema, body);
/** An edit, against the event as it stands (for the fields not being changed). */
export const checkEventEdit = (body: unknown, current: { ageMin: number; ageMax: number }) => check(eventEditSchema, body, current);

/** The form's boxes as the API takes them: an empty number box is null, so it's reported (or, for expenses, cleared). */
export function eventNumbers<K extends string>(form: Record<K, string | number | null | undefined>, keys: K[]): Record<K, number | null> {
  const out = {} as Record<K, number | null>;
  for (const k of keys) {
    const v = form[k];
    out[k] = v == null || String(v).trim() === '' ? null : Number(v);
  }
  return out;
}
export const EVENT_NUMBER_FIELDS = ['ageMin', 'ageMax', 'cost', 'maxMen', 'maxWomen', 'expenses'] as const;
