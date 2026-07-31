import { Prisma } from '@prisma/client';

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

  if (filter.ageMin != null || filter.ageMax != null) {
    const today = new Date();
    // ageMin N years old -> born on or before (today - N years)
    // ageMax N years old -> born on or after (today - N - 1 years)
    where.dateOfBirth = {};
    if (filter.ageMin != null) {
      const cutoff = new Date(today);
      cutoff.setFullYear(cutoff.getFullYear() - filter.ageMin);
      where.dateOfBirth.lte = cutoff;
    }
    if (filter.ageMax != null) {
      const cutoff = new Date(today);
      cutoff.setFullYear(cutoff.getFullYear() - filter.ageMax - 1);
      where.dateOfBirth.gte = cutoff;
    }
  }

  return where;
}
