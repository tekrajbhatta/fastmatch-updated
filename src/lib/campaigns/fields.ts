import { z } from 'zod';
import { cleanStoredRich } from '../richTextClean';
import { oneLine } from '../escapeHtml';
import { normaliseLink, pictureUrl } from '../eventInput';
import { CONTACT_METHODS } from './sendTabFilter';

/**
 * A blast's editable content, as accepted by PATCH /api/admin/campaigns/:id
 * and copied by Duplicate. Listed once so the two can't drift — Duplicate
 * used to copy a hand-written subset and silently dropped the heading, free
 * text, event details, booking link and photo.
 */
export const CONTENT_FIELDS = [
  'title',
  'subject',
  'heading',
  'freeText',
  'eventDetailsText',
  'bookingLink',
  'photoUrl',
  'bannerImageUrl',
  'venueLogoUrl',
  'emailBody',
  'smsFromNumber',
  'smsBody',
  'sendEmail',
  'sendSms',
  'ignorePreference',
  'excludeBooked',
  'excludeBookedEventId',
  'automated',
  'fromName',
  'fromEmail',
] as const;

/** A blast's text field: shared by Create (POST) and Edit (PATCH), so their limits can't drift. */
export const blastText = z.string().max(20_000).nullable().optional();

/**
 * A blast's heading or free text: plain text, or HTML written in the blast
 * editor, which is cleaned here to the editor's own formatting before it's
 * saved (src/lib/richTextClean.ts).
 */
export const blastRichText = blastText.transform((v) => cleanStoredRich(v));

/** A blast picture (photo, banner, venue logo): an upload, a picture on this site, or an http(s) address (src/lib/eventInput.ts). */
export const blastPicture = pictureUrl(blastText);

/** Book Now's link: an http(s) address or a page on this site; one typed without https:// gets it. */
export const blastLink = blastText.transform((v, ctx) => {
  const checked = normaliseLink(v);
  if (checked.ok) return checked.value;
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: checked.error });
  return z.NEVER;
});

/** A blast's subject, kept to one line: a subject is an email header (see oneLine). */
export const blastSubject = z.string().max(20_000).transform(oneLine);

/**
 * Who a blast goes to (Campaign.filter): the Members screen's filter
 * (memberFilterParams.ts) and the Send tab's boxes (sendTabFilter.ts), as the
 * admin pages send them. It's turned straight into a database query
 * (buildMemberWhere), so only these fields, as plain values, get through: it
 * used to take any object, so a value like { not: … } in place of a city
 * became a query operator of its own. Anything else in it is dropped rather
 * than refused, so a blast saved earlier with an older field still sends.
 * Empty values ("", null) mean "not filtered on", as the pages already treat them.
 */
const blank = (v: unknown) => (v === '' || v === null ? undefined : v);
export const blastFilterSchema = z.object({
  search: z.preprocess(blank, z.string().max(200).optional()),
  gender: z.preprocess(blank, z.enum(['MALE', 'FEMALE']).optional()),
  cityId: z.preprocess(blank, z.string().max(50).optional()),
  ageMin: z.preprocess(blank, z.number().finite().min(0).max(150).optional()),
  ageMax: z.preprocess(blank, z.number().finite().min(0).max(150).optional()),
  contactMethods: z.preprocess(blank, z.array(z.enum(CONTACT_METHODS)).max(CONTACT_METHODS.length).optional()),
  // Saved by older blasts. Every send is opted-in members only anyway (recipientFilter).
  marketingOptInOnly: z.preprocess(blank, z.boolean().optional()),
});
export type BlastFilter = z.infer<typeof blastFilterSchema>;

/** The message when a filter isn't one the pages could have sent. */
export const BAD_FILTER = 'Please check the filter: something in it isn’t one of the choices on the page.';

const text = blastText;

export const campaignPatchSchema = z
  .object({
    title: z.string().trim().min(1, 'Please give the blast a title.').max(200).optional(),
    // Kept to one line: a subject is an email header (see oneLine). The form's
    // single-line box can't hold a line break, but the API would accept one.
    subject: blastSubject.nullable().optional(),
    heading: blastRichText,
    freeText: blastRichText,
    eventDetailsText: text,
    bookingLink: blastLink,
    photoUrl: blastPicture,
    bannerImageUrl: blastPicture,
    venueLogoUrl: blastPicture,
    emailBody: text,
    smsFromNumber: text,
    smsBody: text,
    sendEmail: z.boolean().optional(),
    sendSms: z.boolean().optional(),
    ignorePreference: z.boolean().optional(),
    excludeBooked: z.boolean().optional(),
    excludeBookedEventId: z.string().min(1).nullable().optional(),
    automated: z.boolean().optional(),
    fromName: z.string().min(1).max(100).optional(),
    fromEmail: z.string().email().optional(),
    // Who the next send goes to — see Campaign.filter.
    filter: blastFilterSchema.optional(),
  })
  .strict();

export type CampaignPatch = z.infer<typeof campaignPatchSchema>;

export type BlastContentProblem = 'no-channel' | 'no-subject' | 'no-sms-message';

/**
 * What stops a blast being saved or sent as it stands, or null. An email needs
 * a subject and a text needs a message: both used to be allowed blank, so an
 * empty email or text could go out to the whole list.
 */
export function blastContentProblem(c: {
  sendEmail: boolean;
  sendSms: boolean;
  subject?: string | null;
  smsBody?: string | null;
}): BlastContentProblem | null {
  if (!c.sendEmail && !c.sendSms) return 'no-channel';
  if (c.sendEmail && !(c.subject ?? '').trim()) return 'no-subject';
  if (c.sendSms && !(c.smsBody ?? '').trim()) return 'no-sms-message';
  return null;
}

/** The message for each problem when saving (the admin is on the form)… */
export const BLAST_PROBLEM_ON_SAVE: Record<BlastContentProblem, string> = {
  'no-channel': 'At least one of Send Email or Send SMS must be on.',
  'no-subject': 'Please add an email subject, or turn off Send Email.',
  'no-sms-message': 'Please write the SMS message, or turn off Send SMS.',
};

/** …and when sending (the fix is on Edit Blast). */
export const BLAST_PROBLEM_ON_SEND: Record<BlastContentProblem, string> = {
  'no-channel': 'This blast has neither Send Email nor Send SMS turned on. Use Edit Blast to choose one.',
  'no-subject': 'This blast has no email subject. Add one with Edit Blast, or turn off Send Email.',
  'no-sms-message': 'This blast has no SMS message. Write one with Edit Blast, or turn off Send SMS.',
};
