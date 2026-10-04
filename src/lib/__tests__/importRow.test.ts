import { describe, it, expect } from 'vitest';
import { importContactMethod, importOptIn, importGender, cityKey, importCell, skippedRowsCsv } from '@/lib/importRow';

/** The old-site member import: lenient about how values are written, never guessing. */
describe('importContactMethod', () => {
  it('gives a blank cell the default, Email and SMS (those rows used to be skipped)', () => {
    expect(importContactMethod('')).toBe('EMAIL_AND_SMS');
    expect(importContactMethod('   ')).toBe('EMAIL_AND_SMS');
    expect(importContactMethod(undefined)).toBe('EMAIL_AND_SMS');
  });

  it('accepts any capitals, spaces, underscores or an ampersand', () => {
    expect(importContactMethod('Email and SMS')).toBe('EMAIL_AND_SMS');
    expect(importContactMethod('email & sms')).toBe('EMAIL_AND_SMS');
    expect(importContactMethod('EMAIL_AND_SMS')).toBe('EMAIL_AND_SMS');
    expect(importContactMethod(' email ')).toBe('EMAIL');
    expect(importContactMethod('Sms')).toBe('SMS');
    expect(importContactMethod('Do not contact')).toBe('DO_NOT_CONTACT');
  });

  it('reports anything else rather than guessing', () => {
    expect(importContactMethod('phone')).toBeNull();
    expect(importContactMethod('email or sms')).toBeNull();
  });
});

describe('importOptIn', () => {
  it('reads yes, true and 1 as yes — "Yes" and "1" used to count as no', () => {
    for (const v of ['yes', 'Yes', 'YES', 'y', 'true', 'TRUE', '1', ' 1 ']) expect(importOptIn(v)).toBe(true);
  });
  it('reads no, false and 0 as no', () => {
    for (const v of ['no', 'No', 'n', 'false', 'False', '0']) expect(importOptIn(v)).toBe(false);
  });
  it('defaults a blank cell to yes, as before, and reports anything else', () => {
    expect(importOptIn('')).toBe(true);
    expect(importOptIn(undefined)).toBe(true);
    expect(importOptIn('maybe')).toBeNull();
  });
});

describe('importGender and cityKey', () => {
  it('accept any capitals and M / F', () => {
    expect(importGender('female')).toBe('FEMALE');
    expect(importGender(' Male ')).toBe('MALE');
    expect(importGender('m')).toBe('MALE');
    expect(importGender('F')).toBe('FEMALE');
    expect(importGender('x')).toBeNull();
  });
  it('matches city names however they are spaced or capitalised', () => {
    expect(cityKey('  GOLD   coast ')).toBe(cityKey('Gold Coast'));
  });
});

describe('the skipped-rows report', () => {
  it('keeps every original column, adds the reason, and quotes everything', () => {
    const csv = skippedRowsCsv([
      { row: { name: 'Ann', email: 'ann@x.test', city: 'Atlantis' }, reason: 'City "Atlantis" doesn’t match' },
      { row: { name: 'Bob, Jr', email: '', mobile: '0400' }, reason: 'Missing required field' },
    ]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('"name","email","city","mobile","reason"');
    expect(lines[1]).toBe('"Ann","ann@x.test","Atlantis","","City ""Atlantis"" doesn’t match"');
    expect(lines[2]).toBe('"Bob, Jr","","","0400","Missing required field"');
  });

  it('guards against spreadsheet formulas, and the import takes the guard off again', () => {
    const csv = skippedRowsCsv([{ row: { name: '=HYPERLINK("x")', mobile: '+61400000000' }, reason: 'r' }]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(importCell("'+61400000000")).toBe('+61400000000');
    expect(importCell("O'Brien")).toBe("O'Brien");
    expect(importCell("'Quoted")).toBe("'Quoted");
  });
});
