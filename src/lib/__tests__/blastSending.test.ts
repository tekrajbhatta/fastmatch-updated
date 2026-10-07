import { describe, it, expect } from 'vitest';
import { isPermanentAddressRejection } from '@/lib/campaigns/sendFailure';
import { recipientFilter } from '@/lib/campaigns/audience';
import { buildMemberWhere } from '@/lib/memberFilter';

/**
 * Item 14: a blast used to mark a member bounced on ANY send error, so one
 * outage could quietly drop up to 100 people from every future blast.
 */
describe('isPermanentAddressRejection', () => {
  it('is true only when the mail server refuses the address itself', () => {
    expect(isPermanentAddressRejection({ code: 'EENVELOPE', responseCode: 550, command: 'RCPT TO' })).toBe(true);
    expect(isPermanentAddressRejection({ responseCode: 553, command: 'RCPT TO:<x@y>' })).toBe(true);
  });
  it('leaves the member alone for anything temporary or not about the address', () => {
    expect(isPermanentAddressRejection({ code: 'ECONNECTION' })).toBe(false); // server down
    expect(isPermanentAddressRejection({ code: 'ETIMEDOUT' })).toBe(false);
    expect(isPermanentAddressRejection({ code: 'EENVELOPE', responseCode: 451, command: 'RCPT TO' })).toBe(false); // try later
    expect(isPermanentAddressRejection({ code: 'EENVELOPE', responseCode: 554, command: 'DATA' })).toBe(false); // the message, not the address
    expect(isPermanentAddressRejection({ code: 'EENVELOPE', responseCode: 550, command: 'MAIL FROM' })).toBe(false); // OUR sender refused (domain suspended)
    expect(isPermanentAddressRejection({ code: 'EENVELOPE', command: 'API' })).toBe(false); // no server answer at all
    expect(isPermanentAddressRejection({ code: 'EAUTH', responseCode: 535 })).toBe(false); // our login
    expect(isPermanentAddressRejection(new Error('Email send failed: something'))).toBe(false);
    expect(isPermanentAddressRejection(null)).toBe(false);
  });
});

/**
 * Who a blast reaches: anyone who accepts one of the channels being sent,
 * where email only counts for a confirmed address that hasn't bounced, and a
 * text for a confirmed mobile (batch 11: a mistyped one belongs to a
 * stranger). A bounced member still gets the text part of an email-and-text
 * blast (they used to be dropped from the whole send).
 */
describe('recipientFilter: reach', () => {
  const ways = (blast: { sendEmail: boolean; sendSms: boolean; ignorePreference: boolean }) =>
    ((buildMemberWhere(recipientFilter({}, blast)).AND as any[])[0].OR) as any[];
  const EMAIL = { emailVerified: true, emailBounced: false, contactMethod: { in: ['EMAIL_AND_SMS', 'EMAIL'] } };
  const SMS = { mobileVerified: true, contactMethod: { in: ['EMAIL_AND_SMS', 'SMS'] } };

  it('email only: a confirmed address that accepts email and hasn’t bounced', () => {
    expect(ways({ sendEmail: true, sendSms: false, ignorePreference: false })).toEqual([EMAIL]);
  });

  it('email and text: a bounced member who takes texts (on a confirmed mobile) is still included', () => {
    const w = ways({ sendEmail: true, sendSms: true, ignorePreference: false });
    expect(w).toEqual([EMAIL, SMS]);
  });

  it('"Ignore preference": contact method is ignored; a dead or unconfirmed address still isn’t used', () => {
    expect(ways({ sendEmail: true, sendSms: false, ignorePreference: true })).toEqual([{ emailVerified: true, emailBounced: false }]);
    // Never an empty {}: Prisma drops one beside another condition in an OR,
    // which once left bounced members out of the text too.
    expect(ways({ sendEmail: true, sendSms: true, ignorePreference: true })).toEqual([{ emailVerified: true, emailBounced: false }, { mobileVerified: true }]);
    expect(ways({ sendEmail: false, sendSms: true, ignorePreference: true })).toEqual([{ mobileVerified: true }]);
  });

  it('never reaches a member who unsubscribed, "Ignore preference" or not (the user, 7 Oct)', () => {
    for (const ignorePreference of [false, true]) {
      expect(buildMemberWhere(recipientFilter({}, { sendEmail: true, sendSms: true, ignorePreference })).marketingOptIn).toBe(true);
    }
  });

  it('keeps the Members screen’s own search alongside', () => {
    const where = buildMemberWhere(recipientFilter({ search: 'olivia' }, { sendEmail: true, sendSms: false, ignorePreference: false }));
    expect(where.OR).toBeDefined(); // the search
    expect(where.AND).toBeDefined(); // the reach
  });

  it('no channel reaches nobody', () => {
    expect(ways({ sendEmail: false, sendSms: false, ignorePreference: false })).toEqual([{ id: { in: [] } }]);
  });
});
