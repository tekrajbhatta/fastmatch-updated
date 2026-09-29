import { z } from 'zod';

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
    subject: text,
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
