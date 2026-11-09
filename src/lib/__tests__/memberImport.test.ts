import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { checkImportRow, importJoined, importMobile, importYesNo, importedPasswordMarker, IMPORTED_PASSWORD_PREFIX } from '@/lib/importRow';
import { mapOldMember, parseInsertValues } from '../../../members-import/oldSite';

/**
 * The old site's members come across with what they have (the user, 9 Nov):
 * no mobile or no city of ours is fine, everyone gets event news and offers,
 * and anyone whose email would bounce is left out.
 */

const cities = new Map([['sydney', 'city-syd'], ['melbourne', 'city-mel']]);
const NOW = new Date('2026-11-09T00:00:00Z');
const base = { name: 'Anna Smith', email: 'anna@example.com', gender: 'female', dateOfBirth: '1990-04-02' };

describe('checkImportRow', () => {
  it('needs a name, a valid email address, a gender and a real date of birth', () => {
    expect(checkImportRow({ ...base, name: ' ' }, cities, NOW)).toEqual({ ok: false, reason: 'No name' });
    expect(checkImportRow({ ...base, email: '' }, cities, NOW)).toEqual({ ok: false, reason: 'No email address' });
    expect(checkImportRow({ ...base, email: 'anna@hotmail' }, cities, NOW).ok).toBe(false);
    expect(checkImportRow({ ...base, gender: '' }, cities, NOW).ok).toBe(false);
    expect(checkImportRow({ ...base, dateOfBirth: '1990-02-31' }, cities, NOW).ok).toBe(false);
  });

  it('takes a member with no mobile and no city of ours', () => {
    const r = checkImportRow({ ...base, mobile: '', city: 'Darwin' }, cities, NOW);
    expect(r.ok && r.member).toMatchObject({ mobile: '', mobileVerified: false, cityId: null });
    expect(r.ok && r.notes).toEqual({ noMobile: true, mobileNotUsable: false, noCity: true });
  });

  it('keeps an Australian mobile as 04…, confirmed; leaves out one that can’t be texted', () => {
    const ok = checkImportRow({ ...base, mobile: '+61 412 345 678', city: 'sydney' }, cities, NOW);
    expect(ok.ok && ok.member).toMatchObject({ mobile: '0412345678', mobileVerified: true, cityId: 'city-syd' });
    const landline = checkImportRow({ ...base, mobile: '02 9876 5432' }, cities, NOW);
    expect(landline.ok && landline.member).toMatchObject({ mobile: '', mobileVerified: false });
    expect(landline.ok && landline.notes.mobileNotUsable).toBe(true);
    const unconfirmed = checkImportRow({ ...base, mobile: '0412345678', mobileConfirmed: 'no' }, cities, NOW);
    expect(unconfirmed.ok && unconfirmed.member.mobileVerified).toBe(false);
  });

  it('reads the confirmations, offers, contact method and join date, with the old defaults when blank', () => {
    const blank = checkImportRow(base, cities, NOW);
    expect(blank.ok && blank.member).toMatchObject({ emailVerified: true, marketingOptIn: true, contactMethod: 'EMAIL_AND_SMS', joined: null });
    const full = checkImportRow({ ...base, emailConfirmed: 'no', marketingOptIn: 'yes', contactMethod: 'Do not contact', joined: '2006-05-01 10:22:33' }, cities, NOW);
    expect(full.ok && full.member).toMatchObject({ emailVerified: false, marketingOptIn: true, contactMethod: 'DO_NOT_CONTACT' });
    // 10:22 in Sydney on 1 May 2006 (AEST, +10) is 00:22 UTC.
    expect(full.ok && full.member.joined?.toISOString()).toBe('2006-05-01T00:22:00.000Z');
    expect(checkImportRow({ ...base, emailConfirmed: 'maybe' }, cities, NOW).ok).toBe(false);
  });
});

describe('the small readers', () => {
  it('importYesNo: blank is the default given', () => {
    expect(importYesNo('', true)).toBe(true);
    expect(importYesNo(' ', false)).toBe(false);
    expect(importYesNo('No', true)).toBe(false);
    expect(importYesNo('perhaps', true)).toBeNull();
  });
  it('importJoined: blank or 0000-00-00 is the import day; a future or broken date is refused', () => {
    expect(importJoined('', NOW)).toBeNull();
    expect(importJoined('0000-00-00 00:00:00', NOW)).toBeNull();
    expect(importJoined('2006-05-01T00:22:00.000Z', NOW)).toEqual(new Date('2006-05-01T00:22:00.000Z'));
    expect(importJoined('2027-01-01', NOW)).toBe('invalid');
    expect(importJoined('yesterday', NOW)).toBe('invalid');
  });
  it('importMobile: Australian mobiles as 04…, anything else empty', () => {
    expect(importMobile('412345678')).toBe('0412345678');
    expect(importMobile('61412345678')).toBe('0412345678');
    expect(importMobile('1')).toBe('');
    expect(importMobile(null)).toBe('');
  });
});

describe('the imported password', () => {
  it('can never be logged in with, and differs for each member', async () => {
    const a = importedPasswordMarker();
    expect(a.startsWith(IMPORTED_PASSWORD_PREFIX)).toBe(true);
    expect(a).not.toBe(importedPasswordMarker());
    expect(await bcrypt.compare('', a)).toBe(false);
    expect(await bcrypt.compare(a, a)).toBe(false);
  });
});

describe('old-site members (mapOldMember)', () => {
  const old = {
    memberId: '42', firstName: 'Anna', lastName: 'O&#39;Brien', gender: 'female', dob: '1985-07-01', email: ' anna@example.com ',
    emailConfirm: 'conf', bounce: '0', mobile: '412 345 678', contactMethod: 'emailsms', registered: '2006-05-01 10:22:33',
  };
  const map = (over: Record<string, string | null>, location: string | null = 'Sydney') => mapOldMember({ ...old, ...over }, location);

  it('leaves out deleted members, bounced and invalid addresses, and no date of birth', () => {
    expect(map({ emailConfirm: 'del' })).toEqual({ skip: 'Deleted on the old site' });
    expect(map({ bounce: '1' })).toEqual({ skip: 'Email bounced on the old site' });
    expect(map({ email: 'anna.example.com' })).toEqual({ skip: 'Not a valid email address' });
    expect(map({ email: '' })).toEqual({ skip: 'No email address' });
    expect(map({ dob: '0000-00-00' })).toEqual({ skip: 'No valid date of birth' });
  });

  it('brings the rest across as they are, with event news and offers on', () => {
    expect(map({})).toEqual({ row: {
      name: "Anna O'Brien", gender: 'female', email: 'anna@example.com', dateOfBirth: '1985-07-01', mobile: '0412345678', city: 'Sydney',
      emailConfirmed: 'yes', mobileConfirmed: 'yes', marketingOptIn: 'yes', contactMethod: 'Email and SMS', joined: '2006-05-01 10:22:33', oldMemberId: '42',
    } });
    const r = map({ emailConfirm: 'nores', mobile: null, contactMethod: 'none', registered: null, lastName: null }, 'Unknown');
    expect('row' in r && r.row).toMatchObject({ name: 'Anna', emailConfirmed: 'no', mobile: '', mobileConfirmed: 'no', city: '', contactMethod: 'Do not contact', joined: '', marketingOptIn: 'yes' });
    const unsub = map({ emailConfirm: 'unsub' });
    expect('row' in unsub && unsub.row).toMatchObject({ emailConfirmed: 'yes', marketingOptIn: 'yes' });
  });
});

describe('reading a mysqldump INSERT', () => {
  it('handles quotes, escapes, NULL and brackets inside text', () => {
    const line = "INSERT INTO `t` VALUES (1,'O\\'Brien','a (b), c',NULL),(2,'it''s','x\\\\y',3);";
    expect(parseInsertValues(line, line.indexOf(' VALUES ') + 8)).toEqual([
      ['1', "O'Brien", 'a (b), c', null],
      ['2', "it's", 'x\\y', '3'],
    ]);
  });
});
