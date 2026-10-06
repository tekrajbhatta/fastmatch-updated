'use client';

import { Field, Input } from '@/components/ui';
import PhotoUploadField from '@/components/PhotoUploadField';
import VenuePickerField from '@/components/VenuePickerField';
import BookNowEventField from '@/components/BookNowEventField';
import SmsCounter from '@/components/SmsCounter';
import ExcludeBookedField from '@/components/ExcludeBookedField';

export interface BlastContent {
  sendEmail: boolean;
  sendSms: boolean;
  subject: string;
  heading: string;
  freeText: string;
  eventDetailsText: string;
  bookingLink: string;
  photoUrl: string;
  venueLogoUrl: string;
  smsBody: string;
  ignorePreference: boolean;
  excludeBooked: boolean;
  excludeBookedEventId: string | null;
}

/** A blast from the API, as the editable form expects it (nulls → ''). */
export function blastContentFrom(c: Record<string, any>): BlastContent {
  return {
    sendEmail: !!c.sendEmail, sendSms: !!c.sendSms,
    subject: c.subject ?? '', heading: c.heading ?? '', freeText: c.freeText ?? '',
    eventDetailsText: c.eventDetailsText ?? '', bookingLink: c.bookingLink ?? '', photoUrl: c.photoUrl ?? '',
    venueLogoUrl: c.venueLogoUrl ?? '',
    smsBody: c.smsBody ?? '', ignorePreference: !!c.ignorePreference,
    excludeBooked: !!c.excludeBooked, excludeBookedEventId: c.excludeBookedEventId ?? null,
  };
}

const TEXTAREA = 'w-full rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-plum';

/**
 * A blast's content and channels — shared by Edit blast and "Blast these
 * filtered members", so the two always offer the same fields.
 */
export default function BlastFields({ value, onChange }: { value: BlastContent; onChange: (patch: Partial<BlastContent>) => void }) {
  return (
    <>
      <label className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
        <input type="checkbox" checked={value.sendEmail} onChange={(e) => onChange({ sendEmail: e.target.checked })} /> Send Email
      </label>
      {value.sendEmail && (
        <div className="mb-4 rounded-lg bg-cream/40 p-4">
          <Field label="Email subject"><Input required value={value.subject} onChange={(e) => onChange({ subject: e.target.value })} /></Field>
          <Field label="Heading">
            {/* A textarea, not an Input: the heading is meant to wrap onto a
                second line, and renderCampaignEmailHtml turns each newline
                into a <br/> in the email. */}
            <textarea className={TEXTAREA} rows={2} value={value.heading} onChange={(e) => onChange({ heading: e.target.value })}
              placeholder={'PROFESSIONAL SPEED DATING\n27-39 years at Soultrap Surry Hills'} />
          </Field>
          <Field label="Free text">
            <textarea className={TEXTAREA} rows={4} value={value.freeText} onChange={(e) => onChange({ freeText: e.target.value })} />
          </Field>
          <VenuePickerField current={value} onApply={(patch) => onChange(patch)} />
          <PhotoUploadField value={value.photoUrl} onChange={(url) => onChange({ photoUrl: url })} />
          <Field label="Event details">
            <textarea className={TEXTAREA} rows={3} value={value.eventDetailsText} onChange={(e) => onChange({ eventDetailsText: e.target.value })} />
          </Field>
          <PhotoUploadField label="Venue logo" value={value.venueLogoUrl} onChange={(url) => onChange({ venueLogoUrl: url })}
            hint="Optional. Shown under the event details. Filled in from the venue." />
          <BookNowEventField bookingLink={value.bookingLink} subject={value.subject} heading={value.heading} onApply={(patch) => onChange(patch)} />
          <Field label="Booking link"><Input value={value.bookingLink} onChange={(e) => onChange({ bookingLink: e.target.value })} /></Field>
        </div>
      )}

      <label className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
        <input type="checkbox" checked={value.sendSms} onChange={(e) => onChange({ sendSms: e.target.checked })} /> Send SMS
      </label>
      {value.sendSms && (
        <div className="mb-4 rounded-lg bg-cream/40 p-4">
          <Field label="SMS message">
            <textarea className={TEXTAREA} rows={3} required value={value.smsBody} onChange={(e) => onChange({ smsBody: e.target.value })} />
          </Field>
          <SmsCounter body={value.smsBody} className="-mt-2" />
        </div>
      )}

      <label className="mb-4 flex items-start gap-2 text-sm text-ink/70">
        <input type="checkbox" className="mt-0.5" checked={value.ignorePreference} onChange={(e) => onChange({ ignorePreference: e.target.checked })} />
        <span>
          Ignore preference
          <span className="block text-xs text-ink/50">Also sends to members who opted out of offers, chose not to be contacted this way, or whose email bounced.</span>
        </span>
      </label>
      <ExcludeBookedField excludeBooked={value.excludeBooked} eventId={value.excludeBookedEventId} onChange={onChange} />
    </>
  );
}
