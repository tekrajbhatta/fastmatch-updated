import { Prisma } from '@prisma/client';
import { birthDateRange } from './age';

// Shared shape used by both GET /api/admin/members (search/filter screen)
// and Campaign.filter (who a newsletter/SMS blast goes to). One filter
// implementation, not two — per the decision to build marketing natively
// instead of duplicating member data in a third-party tool.
export interface MemberFilter {
  search?: string; // matches name, email, or mobile
  gender?: 'MALE' | 'FEMALE';
  cityId?: string;
  ageMin?: number;
  ageMax?: number;
  marketingOptInOnly?: boolean; // Campaign sends should always set this true
  // Matches the real Blast screen: "Email and SMS" and "SMS" are treated as
  // different groups — pass both values to reach everyone who can receive SMS.
  contactMethods?: ('EMAIL_AND_SMS' | 'EMAIL' | 'SMS')[];
  excludeBounced?: boolean; // default true for campaign sends — see buildMemberWhere
  // Blasts' "Exclude booked members": leave out anyone with a paid booking
  // for this event — or, with eventId null, for any upcoming event.
  excludeBookedIn?: { eventId: string | null };
  // Accounts still waiting for their first password (friends booked in by
  // someone else, Tell A Friend invitees) never chose to join: blasts always
  // leave them out. The Members screen still lists them.
  excludeAwaitingPasswordSetup?: boolean;
  // Blasts: only members the blast can actually reach — who accept at least
  // one of the channels being sent (unless respectContactMethod is false, for
  // "Ignore preference"), where email only counts for an address that hasn't
  // bounced. A bounced member can still get the text part of a blast.
  reachableBy?: { email: boolean; sms: boolean; respectContactMethod: boolean };
}

export function buildMemberWhere(filter: MemberFilter): Prisma.MemberWhereInput {
  const where: Prisma.MemberWhereInput = {};

  if (filter.search) {
    where.OR = [
      { name: { contains: filter.search } },
      { email: { contains: filter.search } },
      { mobile: { contains: filter.search } },
    ];
  }
  if (filter.gender) where.gender = filter.gender;
  if (filter.cityId) where.cityId = filter.cityId;
  if (filter.marketingOptInOnly) where.marketingOptIn = true;
  if (filter.contactMethods?.length) where.contactMethod = { in: filter.contactMethods };
  if (filter.excludeBounced) where.emailBounced = false;
  if (filter.excludeAwaitingPasswordSetup) where.awaitingPasswordSetup = false;
  if (filter.reachableBy) {
    const { email, sms, respectContactMethod } = filter.reachableBy;
    // A text sent whatever people's contact choice ("Ignore preference")
    // reaches everyone, so there's nothing to narrow. Said by leaving the
    // condition out: Prisma drops an empty {} that sits beside another
    // condition in an OR, which left bounced members out of the text too.
    if (!(sms && !respectContactMethod)) {
      const ways: Prisma.MemberWhereInput[] = [];
      if (email) ways.push({ emailBounced: false, ...(respectContactMethod ? { contactMethod: { in: ['EMAIL_AND_SMS', 'EMAIL'] } } : {}) });
      if (sms) ways.push({ contactMethod: { in: ['EMAIL_AND_SMS', 'SMS'] } });
      // Its own AND, so it can't clash with the search's OR. No channel: nobody.
      where.AND = [{ OR: ways.length ? ways : [{ id: { in: [] } }] }];
    }
  }
  if (filter.excludeBookedIn) {
    // Paid bookings only — an unpaid one isn't a booking (see pendingBooking.ts).
    const eventId = filter.excludeBookedIn.eventId;
    where.bookings = {
      none: { status: 'CONFIRMED', ...(eventId ? { eventId } : { event: { startsAt: { gte: new Date() } } }) },
    };
  }

  if (filter.ageMin != null || filter.ageMax != null) {
    // Same definition of age as everywhere else (src/lib/age.ts). The upper
    // bound used to include people on their (max + 1)th birthday.
    where.dateOfBirth = birthDateRange(filter.ageMin, filter.ageMax);
  }

  return where;
}
