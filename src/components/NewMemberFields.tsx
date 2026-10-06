'use client';

import { Card, Field, Input, Select } from '@/components/ui';
import { AU_MOBILE_MESSAGE } from '@/lib/mobile';

/** A new member's details, as both of the admin's "Add member" forms collect them. */
export interface NewMemberForm {
  name: string; email: string; password: string; gender: string; dateOfBirth: string; mobile: string; cityId: string;
  confirmation: string; contactMethod: string; marketingOptIn: boolean;
}

export const BLANK_NEW_MEMBER: NewMemberForm = {
  name: '', email: '', password: '', gender: 'MALE', dateOfBirth: '', mobile: '', cityId: '',
  confirmation: 'CONFIRMED', contactMethod: 'EMAIL_AND_SMS', marketingOptIn: false,
};

// What each "Email/Phone confirmation" choice means for the person, shown
// under the select so the admin knows what will be sent.
const CONFIRMATION_HELP: Record<string, string> = {
  CONFIRMED: 'Nothing to confirm. They can book online straight away.',
  EMAIL: 'Email is confirmed. They’ll be texted a code to confirm their mobile.',
  PHONE: 'Mobile is confirmed. They’ll be emailed a link to confirm their email.',
  UNCONFIRMED: 'They’ll be emailed a link and texted a code, and must confirm both before booking online.',
};

/**
 * The "Member details" card of an event's "Add a new member" and the Members
 * page's "Add member" — one set of fields, so the two can't drift apart.
 */
export default function NewMemberFields({ form, set, cities, confirmationNote }: {
  form: NewMemberForm;
  set: (patch: Partial<NewMemberForm>) => void;
  cities: { id: string; name: string }[];
  /** Added after the confirmation help ("Either way, they're booked into this event now."). */
  confirmationNote?: string;
}) {
  return (
    <Card className="mb-4">
      <h2 className="mb-3 font-extrabold text-ink">Member details</h2>
      <Field label="Name"><Input required value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
      {/* autoComplete off / new-password: otherwise the browser offers the
          ADMIN's own saved login for these two fields. */}
      <Field label="Email"><Input type="email" required autoComplete="off" value={form.email} onChange={(e) => set({ email: e.target.value })} /></Field>
      <Field label="Password">
        <Input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => set({ password: e.target.value })} />
        <p className="mt-1 text-xs text-ink/50">
          At least 8 characters. Give it to them yourself: it isn&apos;t emailed. They can log in with it, or choose their own (they&apos;re asked once, after logging in).
        </p>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Gender">
          <Select value={form.gender} onChange={(e) => set({ gender: e.target.value })}>
            <option value="MALE">Male</option><option value="FEMALE">Female</option>
          </Select>
        </Field>
        <Field label="Date of birth">
          <Input type="date" required value={form.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value })} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Mobile">
          <Input required autoComplete="off" placeholder="0412 345 678" title={AU_MOBILE_MESSAGE} value={form.mobile} onChange={(e) => set({ mobile: e.target.value })} />
        </Field>
        <Field label="Location">
          <Select required value={form.cityId} onChange={(e) => set({ cityId: e.target.value })}>
            <option value="" disabled>Select a location</option>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Email/Phone confirmation">
        <Select value={form.confirmation} onChange={(e) => set({ confirmation: e.target.value })}>
          <option value="CONFIRMED">Confirmed</option>
          <option value="EMAIL">Confirmed Email</option>
          <option value="PHONE">Confirmed Phone</option>
          <option value="UNCONFIRMED">Unconfirmed</option>
        </Select>
        <p className="mt-1 text-xs text-ink/50">
          {CONFIRMATION_HELP[form.confirmation]} The terms are accepted for them.{confirmationNote ? ` ${confirmationNote}` : ''}
        </p>
      </Field>
      <Field label="Preferred contact method">
        <Select value={form.contactMethod} onChange={(e) => set({ contactMethod: e.target.value })}>
          <option value="EMAIL_AND_SMS">Email and SMS</option>
          <option value="EMAIL">Email</option>
          <option value="SMS">SMS</option>
          <option value="DO_NOT_CONTACT">Do not contact</option>
        </Select>
      </Field>
      <label className="flex items-start gap-2 text-sm font-semibold text-ink">
        <input type="checkbox" className="mt-0.5" checked={form.marketingOptIn} onChange={(e) => set({ marketingOptIn: e.target.checked })} />
        <span>
          Receive special offers
          <span className="block text-xs font-normal text-ink/50">Only tick if they&apos;ve said yes. Blasts go only to members who opted in.</span>
        </span>
      </label>
    </Card>
  );
}
