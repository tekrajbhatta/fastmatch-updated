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

/*
 * Addresses an admin types or uploads: event and venue pictures, blast photos
 * and banners, a blast's Book Now link, a venue's website. They end up in
 * <img src> and <a href> on the site and in emails, so only real web
 * addresses get in, never javascript:, data: or the like. The emails were
 * already safe (safeHref/safeSrc drop anything else when they're built);
 * this stops such a value being saved at all, with a message saying why.
 *
 * Shared by the event, venue and blast forms' API routes. No Prisma import:
 * the forms can use these in the browser too.
 */

/** An http(s) address that really parses as one. */
const isWebAddress = (v: string) => {
  if (!/^https?:\/\//i.test(v)) return false;
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
};

/**
 * A path on this site ("/api/uploads/…" for an upload, "/photos/…" for the
 * site's own pictures, "/events/…" for a booking link). Not "//host" or
 * "/\host", which browsers read as another site, and no spaces or
 * backslashes: the same rule the emails apply (safeSrc).
 */
const isSitePath = (v: string) => /^\/(?![/\\])[^\s\\]*$/.test(v);

/** "www.bar.com.au" or "bar.com.au/whats-on": a website typed without https://. */
const isBareDomain = (v: string) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(?::\d{1,5})?(?:[/?#][^\s"'<>\\]*)?$/i.test(v);

/** A picture's address: an upload or other page-relative path on this site, or an http(s) address. Blank is fine. */
export function pictureUrlProblem(v: string | null | undefined): string | null {
  const s = v?.trim();
  if (!s || isWebAddress(s) || isSitePath(s)) return null;
  return 'Please upload the picture again, or use a web address starting with https://.';
}

/**
 * A link (a blast's Book Now): an http(s) address or a page on this site. One
 * typed without https:// ("fastmatch.com.au/events") gets it added, as the
 * admin plainly meant that site: the email used to drop such a link silently
 * and send Book Now to the events page instead.
 */
export function normaliseLink(v: string | null | undefined): { ok: true; value: string | null | undefined } | { ok: false; error: string } {
  if (v == null) return { ok: true, value: v };
  const s = v.trim();
  if (!s || isWebAddress(s) || isSitePath(s)) return { ok: true, value: v };
  if (isBareDomain(s) && isWebAddress(`https://${s}`)) return { ok: true, value: `https://${s}` };
  return { ok: false, error: 'Please enter the link as a web address, like https://fastmatch.com.au/events.' };
}

/**
 * A venue's website: shown as text (in the venue list and a blast's event
 * details), so it's kept exactly as typed. Admins usually type it without
 * https:// ("ggbar.com.au"), which is fine; only something that isn't a web
 * address at all is refused.
 */
export function websiteProblem(v: string | null | undefined): string | null {
  const s = v?.trim();
  if (!s || isWebAddress(s) || isBareDomain(s)) return null;
  return 'Please enter the venue’s website as a web address, like ggbar.com.au.';
}

/** zod: a picture's address (see pictureUrlProblem), unchanged. */
export const pictureUrl = <T extends z.ZodTypeAny>(schema: T) =>
  schema.superRefine((v: unknown, ctx) => {
    const problem = typeof v === 'string' ? pictureUrlProblem(v) : null;
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  });

export const eventFieldsSchema = z.object({
  themeId: z.string(say('Please choose an event type.')).min(1, 'Please choose an event type.'),
  name: z.string(say('Please give the event a name.')).trim().min(1, 'Please give the event a name.').max(200, 'Please keep the name under 200 characters.'),
  description: z.string().max(20_000).nullable().optional().transform((v) => v || null),
  photoUrl: pictureUrl(z.string().max(2_000).nullable().optional()).transform((v) => v || null),
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
/**
 * A closed event (its matches worked out and sent) keeps its date (the user,
 * 12 Nov): moving it forward put it back on Upcoming Events, bookable, with
 * its results already out (event 33, moved from 7 to 28 Nov). To run it
 * again, the admin duplicates it.
 */
export const CLOSED_EVENT_DATE_MESSAGE = 'This event is closed, so its date can’t be changed. Duplicate the event to run it again.';

/** Whether an edit would move a closed event's start time. */
export function movesClosedEvent(current: { matchesCalculated: boolean; startsAt: Date }, newStartsAt: string | undefined): boolean {
  if (!current.matchesCalculated || newStartsAt === undefined) return false;
  return new Date(newStartsAt).getTime() !== current.startsAt.getTime();
}

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
