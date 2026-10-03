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
    expect(dob.gt).toBeInstanceOf(Date);
    // The assertion here was inverted as delivered (it expected lte < gte),
    // which describes an impossible range and failed. Prisma reads this as
    // gt < dateOfBirth <= lte, so for ages 25-40 today:
    //   gt  = today - 41 years  (born on this day is already 41: excluded)
    //   lte = today - 25 years  (the YOUNGEST birth date still at least 25)
    // i.e. someone aged 25-40 was born between those two dates, so gt is
    // necessarily EARLIER than lte. Do not "fix" this by changing
    // buildMemberWhere — inverting the range there would make every age-
    // filtered query in Members and Reports return nothing at all.
    expect(dob.gt.getTime()).toBeLessThan(dob.lte.getTime());

    // Sanity-check the actual ages the boundaries represent.
    const yearsAgo = (d: Date) =>
      (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    expect(yearsAgo(dob.lte)).toBeCloseTo(25, 0);
    expect(yearsAgo(dob.gt)).toBeCloseTo(41, 0);
  });

  it('marketingOptInOnly filters to opted-in members only', () => {
    expect(buildMemberWhere({ marketingOptInOnly: true }).marketingOptIn).toBe(true);
    expect(buildMemberWhere({}).marketingOptIn).toBeUndefined();
  });
});

describe('excludeBookedIn — blasts’ “Exclude booked members”', () => {
  it('one event: no paid booking for it', () => {
    expect(buildMemberWhere({ excludeBookedIn: { eventId: 'ev1' } }).bookings).toEqual({
      none: { status: 'CONFIRMED', eventId: 'ev1' },
    });
  });

  it('any upcoming event: no paid booking for an event that hasn’t started', () => {
    const where = buildMemberWhere({ excludeBookedIn: { eventId: null } }) as any;
    expect(where.bookings.none.status).toBe('CONFIRMED');
    expect(where.bookings.none.event.startsAt.gte).toBeInstanceOf(Date);
  });

  it('left out entirely when not asked for', () => {
    expect(buildMemberWhere({ gender: 'MALE' }).bookings).toBeUndefined();
  });
});

describe('blast audiences never include accounts waiting for their first password', () => {
  it('leaves them out of every blast, "Ignore preference" included', async () => {
    const { recipientFilter } = await import('../campaigns/audience');
    for (const ignorePreference of [false, true]) {
      const where = buildMemberWhere(recipientFilter({}, { sendEmail: true, sendSms: true, ignorePreference }));
      expect(where.awaitingPasswordSetup).toBe(false);
    }
  });

  it('still lists them on the Members screen', () => {
    expect(buildMemberWhere({}).awaitingPasswordSetup).toBeUndefined();
  });
});
