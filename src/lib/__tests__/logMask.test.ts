import { describe, it, expect } from 'vitest';
import { maskEmail, maskMobile } from '../logMask';
import { addressBucket } from '../rateLimit';

describe('log masking', () => {
  it('keeps only the first letters and the ending of an email', () => {
    expect(maskEmail('jane.smith@gmail.com')).toBe('j***@g***.com');
    expect(maskEmail('a@b')).toBe('a***@b***');
    expect(maskEmail('')).toBe('');
    expect(maskEmail('not-an-email')).toBe('***');
  });
  it('keeps only the last three digits of a mobile', () => {
    expect(maskMobile('0412 345 678')).toBe('***678');
    expect(maskMobile('+61412345678')).toBe('***678');
    expect(maskMobile(null)).toBe('');
  });
});

describe('addressBucket', () => {
  it('keeps an IPv4 address as it is', () => {
    expect(addressBucket('203.0.113.7')).toBe('203.0.113.7');
    expect(addressBucket('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(addressBucket('unknown')).toBe('unknown');
  });
  it('counts every address in one IPv6 /64 as one visitor', () => {
    const a = addressBucket('2001:db8:85a3:12::1');
    expect(a).toBe('2001:db8:85a3:12::/64');
    expect(addressBucket('2001:0db8:85a3:0012:ffff:ffff:ffff:ffff')).toBe(a);
    expect(addressBucket('[2001:db8:85a3:12:abcd::9]')).toBe(a);
    expect(addressBucket('2001:db8:85a3:13::1')).not.toBe(a);
    expect(addressBucket('::1')).toBe('0:0:0:0::/64');
  });
});
