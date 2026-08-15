import { describe, it, expect } from 'vitest';
import { buildMemberWhere } from '../memberFilter';

describe('buildMemberWhere', () => {
  it('returns an empty filter for no criteria', () => {
    expect(buildMemberWhere({})).toEqual({});
  });

  it('builds a case-matching OR clause for search across name/email/mobile', () => {
    const where = buildMemberWhere({ search: 'jane' });
    expect(where.OR).toEqual([
      { name: { contains: 'jane' } },
      { email: { contains: 'jane' } },
      { mobile: { contains: 'jane' } },
    ]);
  });

  it('applies gender and city directly', () => {
    const where = buildMemberWhere({ gender: 'FEMALE', cityId: 'city-1' });
    expect(where.gender).toBe('FEMALE');
    expect(where.cityId).toBe('city-1');
  });

  it('only excludes bounced members when explicitly asked (not by default)', () => {
    // Regression guard: the Members admin screen must NOT hide bounced
    // members from view — only campaign sends should skip them. This was
    // deliberately made opt-in for that reason; don't let it flip back to
    // default-on.
    expect(buildMemberWhere({}).emailBounced).toBeUndefined();
    expect(buildMemberWhere({ excludeBounced: true }).emailBounced).toBe(false);
  });

  it('builds an age range from ageMin/ageMax using date-of-birth cutoffs', () => {
    const where = buildMemberWhere({ ageMin: 25, ageMax: 40 });
    expect(where.dateOfBirth).toBeDefined();
    const dob = where.dateOfBirth as any;
    expect(dob.lte).toBeInstanceOf(Date);
    expect(dob.gte).toBeInstanceOf(Date);
    // The assertion here was inverted as delivered (it expected lte < gte),
    // which describes an impossible range and failed. Prisma reads this as
    // gte <= dateOfBirth <= lte, so for ages 25-40 today:
    //   gte = today - 41 years  (the OLDEST birth date still within age 40)
    //   lte = today - 25 years  (the YOUNGEST birth date still at least 25)
    // i.e. someone aged 25-40 was born between those two dates, so gte is
    // necessarily EARLIER than lte. Do not "fix" this by changing
    // buildMemberWhere — inverting the range there would make every age-
    // filtered query in Members and Reports return nothing at all.
    expect(dob.gte.getTime()).toBeLessThan(dob.lte.getTime());

    // Sanity-check the actual ages the boundaries represent.
    const yearsAgo = (d: Date) =>
      (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    expect(yearsAgo(dob.lte)).toBeCloseTo(25, 0);
    expect(yearsAgo(dob.gte)).toBeCloseTo(41, 0);
  });

  it('marketingOptInOnly filters to opted-in members only', () => {
    expect(buildMemberWhere({ marketingOptInOnly: true }).marketingOptIn).toBe(true);
    expect(buildMemberWhere({}).marketingOptIn).toBeUndefined();
  });
});
