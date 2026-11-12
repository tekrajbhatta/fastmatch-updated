import { describe, it, expect } from 'vitest';
import { leftOutReason, leftOutSentence, leftOutPart, sortLeftOut, LEFT_OUT_ORDER, type LeftOutMember, type LeftOutBlast } from '@/lib/campaigns/leftOut';
import { buildMemberWhere } from '@/lib/memberFilter';
import { recipientFilter } from '@/lib/campaigns/audience';

/**
 * "2 of the 11 filtered members will receive this blast. Left out: 7 have an
 * email address that bounced, 1 has unsubscribed from event news and offers,
 * 1 hasn't confirmed their email address." (the user, 13 Nov, for Gil's
 * "1 of 11" report: the page used to list every possible reason, without counts).
 */

const ok: LeftOutMember = {
  marketingOptIn: true, awaitingPasswordSetup: false, emailVerified: true, emailBounced: false,
  mobileVerified: true, contactMethod: 'EMAIL_AND_SMS', hasMobile: true, booked: false,
};
const emailOnly: LeftOutBlast = { sendEmail: true, sendSms: false, ignorePreference: false };
const smsOnly: LeftOutBlast = { sendEmail: false, sendSms: true, ignorePreference: false };
const both: LeftOutBlast = { sendEmail: true, sendSms: true, ignorePreference: false };

/** Reasons counted as the page counts them. */
function tally(members: LeftOutMember[], blast: LeftOutBlast) {
  const counts = new Map<string, number>();
  let recipients = 0;
  for (const m of members) {
    const key = leftOutReason(m, blast);
    if (key === null) recipients += 1;
    else counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return { recipients, groups: [...counts].map(([key, count]) => ({ key, count })) };
}

describe('the counts on the blast page', () => {
  it("words Gil's 11 test members as agreed", () => {
    // As the live site had them (13 Nov): 7 bounced, the admin account unsubscribed,
    // one email never confirmed, two that receive it.
    const members = [
      ...Array.from({ length: 7 }, () => ({ ...ok, emailBounced: true })),
      { ...ok, marketingOptIn: false },
      { ...ok, emailVerified: false },
      ok, ok,
    ];
    const { recipients, groups } = tally(members, emailOnly);
    expect(recipients).toBe(2);
    expect(leftOutSentence(groups)).toBe(
      'Left out: 7 have an email address that bounced, 1 has unsubscribed from event news and offers, 1 hasn’t confirmed their email address.',
    );
  });

  it('lists the largest first, equal ones in a fixed order, with thousands separated', () => {
    expect(sortLeftOut([{ key: 'email:unconfirmed', count: 1 }, { key: 'unsubscribed', count: 1 }, { key: 'email:bounced', count: 3210 }]).map((g) => g.key))
      .toEqual(['email:bounced', 'unsubscribed', 'email:unconfirmed']);
    expect(leftOutPart({ key: 'email:bounced', count: 3210 })).toBe('3,210 have an email address that bounced');
    expect(leftOutPart({ key: 'email:preference', count: 1 })).toBe('1 doesn’t want to be contacted by email');
  });

  it('counts each member once: unsubscribed, then not set up, then booked, then the channels', () => {
    expect(leftOutReason({ ...ok, marketingOptIn: false, emailBounced: true, awaitingPasswordSetup: true }, emailOnly)).toBe('unsubscribed');
    expect(leftOutReason({ ...ok, awaitingPasswordSetup: true, emailBounced: true }, emailOnly)).toBe('not-set-up');
    expect(leftOutReason({ ...ok, booked: true, emailBounced: true }, { ...emailOnly, excludeBooked: true })).toBe('booked');
    // Booked only counts with "Exclude booked members".
    expect(leftOutReason({ ...ok, booked: true }, emailOnly)).toBeNull();
    // A bounced address can't be confirmed either: the bounce is the reason.
    expect(leftOutReason({ ...ok, emailBounced: true, emailVerified: false }, emailOnly)).toBe('email:bounced');
  });

  it('"Ignore preference" drops the contact-choice reason, and nothing else', () => {
    const doNotContact = { ...ok, contactMethod: 'DO_NOT_CONTACT' };
    expect(leftOutReason(doNotContact, emailOnly)).toBe('email:preference');
    expect(leftOutReason(doNotContact, { ...emailOnly, ignorePreference: true })).toBeNull();
    expect(leftOutReason({ ...doNotContact, marketingOptIn: false }, { ...emailOnly, ignorePreference: true })).toBe('unsubscribed');
  });

  it('words texts and emailed-and-texted blasts', () => {
    expect(leftOutPart({ key: leftOutReason({ ...ok, mobileVerified: false, hasMobile: false }, smsOnly)!, count: 2 })).toBe('2 have no mobile number');
    expect(leftOutPart({ key: leftOutReason({ ...ok, mobileVerified: false }, smsOnly)!, count: 1 })).toBe('1 hasn’t confirmed their mobile');
    expect(leftOutPart({ key: leftOutReason({ ...ok, contactMethod: 'DO_NOT_CONTACT' }, both)!, count: 4 })).toBe('4 don’t want to be contacted by email or SMS');
    expect(leftOutPart({ key: leftOutReason({ ...ok, emailVerified: false, mobileVerified: false }, both)!, count: 1 }))
      .toBe('1 hasn’t confirmed their email address or mobile');
    expect(leftOutPart({ key: leftOutReason({ ...ok, emailBounced: true, mobileVerified: false, hasMobile: false }, both)!, count: 3 }))
      .toBe('3 have an email address that bounced and have no mobile number');
    // Reached by one of the two: not left out.
    expect(leftOutReason({ ...ok, emailBounced: true }, both)).toBeNull();
    expect(leftOutReason({ ...ok, contactMethod: 'EMAIL', mobileVerified: false }, both)).toBeNull();
  });

  it('has wording for every reason it can give', () => {
    for (const key of LEFT_OUT_ORDER) expect(leftOutPart({ key, count: 2 })).not.toContain('can’t be reached');
  });
});

/** Whether a member meets a Prisma where built by buildMemberWhere (just the parts a blast's own rules use). */
function meets(where: Record<string, unknown>, m: LeftOutMember): boolean {
  return Object.entries(where).every(([field, rule]) => {
    if (field === 'AND') return (rule as Record<string, unknown>[]).every((w) => meets(w, m));
    if (field === 'OR') return (rule as Record<string, unknown>[]).some((w) => meets(w, m));
    if (field === 'NOT') return !meets(rule as Record<string, unknown>, m);
    if (field === 'id') return ((rule as { in: string[] }).in.length > 0);
    if (field === 'bookings') return 'none' in (rule as object) ? !m.booked : m.booked;
    if (rule && typeof rule === 'object' && 'in' in rule) return (rule as { in: unknown[] }).in.includes(m[field as keyof LeftOutMember]);
    return m[field as keyof LeftOutMember] === rule;
  });
}

describe('agrees with the send about who gets the blast', () => {
  it('for every combination of settings and blast options', () => {
    const flags = [false, true];
    let checked = 0;
    for (const sendEmail of flags) for (const sendSms of flags) for (const ignorePreference of flags) for (const excludeBooked of flags) {
      const blast = { sendEmail, sendSms, ignorePreference, excludeBooked };
      // The send's own rules, on top of an empty filter (src/lib/campaigns/audience.ts).
      const rules = buildMemberWhere(recipientFilter({}, blast)) as Record<string, unknown>;
      for (const marketingOptIn of flags) for (const awaitingPasswordSetup of flags) for (const emailVerified of flags)
      for (const emailBounced of flags) for (const mobileVerified of flags) for (const hasMobile of flags) for (const booked of flags)
      for (const contactMethod of ['EMAIL_AND_SMS', 'EMAIL', 'SMS', 'DO_NOT_CONTACT']) {
        const m = { marketingOptIn, awaitingPasswordSetup, emailVerified, emailBounced, mobileVerified, hasMobile, booked, contactMethod };
        expect(leftOutReason(m, blast) === null, JSON.stringify({ blast, m })).toBe(meets(rules, m));
        checked += 1;
      }
    }
    expect(checked).toBe(16 * 512);
  });
});
