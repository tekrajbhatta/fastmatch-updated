import { z } from 'zod';
import { oneLine } from '../escapeHtml';

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

const text = z.string().max(20_000).nullable().optional();

export const campaignPatchSchema = z
  .object({
    title: z.string().trim().min(1, 'Please give the blast a title.').max(200).optional(),
    // Kept to one line: a subject is an email header (see oneLine). The form's
    // single-line box can't hold a line break, but the API would accept one.
    subject: z.string().max(20_000).transform(oneLine).nullable().optional(),
    heading: text,
    freeText: text,
    eventDetailsText: text,
    bookingLink: text,
    photoUrl: text,
    bannerImageUrl: text,
    venueLogoUrl: text,
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
    filter: z.record(z.any()).optional(),
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
