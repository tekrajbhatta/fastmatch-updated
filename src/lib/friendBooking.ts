/**
 * Checks on the friends a member wants to bring, shared by the event page
 * (to mark fields as the member types) and the booking API (the real gate).
 * Pure — no database. Checks that need the database (is this email already a
 * member, already booked?) live in src/lib/memberBooking.ts.
 */
import { calculateAge } from './age';
import { isAustralianMobile } from './mobile';
import { nameProblem } from './personName';

export type FriendGender = 'MALE' | 'FEMALE';

export interface FriendInput {
  gender: FriendGender;
  name: string;
  mobile: string;
  email: string;
  /** YYYY-MM-DD, from a date input. Their age is worked out from this. */
  dateOfBirth: string;
}

export interface FriendFieldError {
  index: number;
  field: 'name' | 'mobile' | 'email' | 'dateOfBirth';
  message: string;
}

// The same rule as every other email field (zod's .email(), which the
// server uses; copied here so this file stays free of zod for the event
// page). It used to be looser: an address like anna@exämple.com passed
// here, then the database, which ignores accents when comparing, matched it
// to a different member's anna@example.com.
export const EMAIL_RE = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;

export const AGE_BRACKET_MESSAGE = "Friend does not fall into this event's age bracket";

/**
 * A YYYY-MM-DD date of birth as a Date, or null if it isn't a real, past
 * date. Parsed as UTC midnight — the same way registration stores it.
 */
export function parseDateOfBirth(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) return null;
  // Rejects 2000-02-31 and friends, which Date would silently roll over.
  if (d.toISOString().slice(0, 10) !== value.trim()) return null;
  if (d.getTime() > Date.now() || d.getUTCFullYear() < 1900) return null;
  return d;
}

export function validateFriends(
  friends: FriendInput[],
  ctx: { ageMin: number; ageMax: number; memberEmail: string },
): FriendFieldError[] {
  const errors: FriendFieldError[] = [];
  const seen = new Map<string, number>();

  friends.forEach((f, index) => {
    if (!f.name.trim()) errors.push({ index, field: 'name', message: 'Please enter their name' });
    else {
      // Their name greets them in their booking email: not an email address (personName.ts).
      const problem = nameProblem(f.name, 'their');
      if (problem) errors.push({ index, field: 'name', message: problem });
    }
    if (!f.mobile.trim()) errors.push({ index, field: 'mobile', message: 'Please enter their mobile' });
    // Australian mobiles only (Gil, Q21).
    else if (!isAustralianMobile(f.mobile)) errors.push({ index, field: 'mobile', message: 'Please enter an Australian mobile, like 0412 345 678' });

    const email = f.email.trim().toLowerCase();
    if (!email) errors.push({ index, field: 'email', message: 'Please enter their email' });
    else if (!EMAIL_RE.test(email)) errors.push({ index, field: 'email', message: 'Please enter a valid email' });
    else if (email === ctx.memberEmail.trim().toLowerCase()) errors.push({ index, field: 'email', message: "That's your own email. Please use your friend's" });
    else if (seen.has(email)) errors.push({ index, field: 'email', message: `Same email as friend ${seen.get(email)! + 1}` });
    else seen.set(email, index);

    if (!f.dateOfBirth.trim()) {
      errors.push({ index, field: 'dateOfBirth', message: 'Please enter their date of birth' });
    } else {
      const dob = parseDateOfBirth(f.dateOfBirth);
      if (!dob) {
        errors.push({ index, field: 'dateOfBirth', message: 'Please enter a valid date of birth' });
      } else {
        const age = calculateAge(dob);
        if (age < 18 || age < ctx.ageMin || age > ctx.ageMax) {
          errors.push({ index, field: 'dateOfBirth', message: AGE_BRACKET_MESSAGE });
        }
      }
    }
  });

  return errors;
}
