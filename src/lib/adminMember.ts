import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { calculateAge } from './age';
import { CONFIRMATION_OPTIONS } from './memberVerification';
import { isAustralianMobile, AU_MOBILE_MESSAGE } from './mobile';
import { nameProblemSentence } from './personName';

/**
 * A member the admin registers: from an event's "Add a new member" (which
 * also books them in) or the Members page's "Add member". One set of rules for
 * both, so they can't drift apart.
 */
export const newMemberFields = {
  password: z.string().min(8, 'The password must be at least 8 characters.'),
  name: z.string().trim().min(1, 'Please enter a name.'),
  gender: z.enum(['MALE', 'FEMALE']),
  email: z.string().trim().email('Please enter a valid email address.'),
  dateOfBirth: z.string().min(1, 'Please enter a date of birth.'),
  // Australian mobiles only (Gil, Q21).
  mobile: z.string().trim().min(1, 'Please enter a mobile number.').refine(isAustralianMobile, AU_MOBILE_MESSAGE),
  cityId: z.string().min(1, 'Please select a location.'),
  confirmation: z.enum(['CONFIRMED', 'EMAIL', 'PHONE', 'UNCONFIRMED']),
  contactMethod: z.enum(['EMAIL_AND_SMS', 'EMAIL', 'SMS', 'DO_NOT_CONTACT']),
  marketingOptIn: z.boolean(),
};
export const newMemberSchema = z.object(newMemberFields);
export type NewMember = z.infer<typeof newMemberSchema>;

type Checked = { ok: true; dob: Date } | { ok: false; status: number; error: string };

/**
 * The checks that need the database. `registered` words the refusal for an
 * address that's already a member's: nothing is saved then, password
 * included, so the admin is told what to do instead.
 */
export async function checkNewMember(data: NewMember, registered: (name: string) => string): Promise<Checked> {
  const nameIssue = nameProblemSentence(data.name, 'the member’s');
  if (nameIssue) return { ok: false, status: 400, error: nameIssue };
  const dob = new Date(data.dateOfBirth);
  if (Number.isNaN(dob.getTime())) return { ok: false, status: 400, error: 'Please enter a valid date of birth.' };
  if (calculateAge(dob) < 18) return { ok: false, status: 400, error: 'Members must be at least 18 years old.' };

  const existing = await prisma.member.findUnique({ where: { email: data.email }, select: { name: true } });
  if (existing) return { ok: false, status: 409, error: registered(existing.name) };

  const city = await prisma.city.findUnique({ where: { id: data.cityId }, select: { id: true } });
  if (!city) return { ok: false, status: 400, error: 'Please select a valid location.' };
  return { ok: true, dob };
}

/**
 * The new member's row.
 *   - "Email/Phone confirmation" sets the same two flags self-registration does.
 *   - The terms are accepted for them (Gil, item 10): they used to be stopped
 *     the first time they booked online, until they found the button.
 *   - The password is the one the admin chose and gave them. They can keep it
 *     or choose their own, and are asked once after logging in.
 */
export function newMemberData(data: NewMember, passwordHash: string, dob: Date): Prisma.MemberUncheckedCreateInput {
  const flags = CONFIRMATION_OPTIONS[data.confirmation];
  return {
    name: data.name,
    gender: data.gender,
    email: data.email,
    passwordHash,
    dateOfBirth: dob,
    mobile: data.mobile,
    cityId: data.cityId,
    emailVerified: flags.emailVerified,
    mobileVerified: flags.mobileVerified,
    contactMethod: data.contactMethod,
    marketingOptIn: data.marketingOptIn,
    agreedTerms: true,
    agreedTermsAt: new Date(),
    passwordSetByAdmin: true,
  };
}
