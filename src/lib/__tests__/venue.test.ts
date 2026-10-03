import { describe, it, expect } from 'vitest';
import { venueBlock } from '@/lib/venue';

const gg = { name: 'GG Bar', address: '88 Campbell St, Surry Hills', phone: '(02) 9955 1234', websiteUrl: 'ggbar.com.au' };

describe('venueBlock', () => {
  it('is the venue’s lines, blanks dropped', () => {
    expect(venueBlock(gg)).toBe('GG Bar\n88 Campbell St, Surry Hills\n(02) 9955 1234\nggbar.com.au');
    expect(venueBlock({ name: 'GG Bar', address: ' ', phone: null })).toBe('GG Bar');
  });

  it('puts the city after the address, not after the website', () => {
    expect(venueBlock(gg, 'Sydney')).toBe('GG Bar\n88 Campbell St, Surry Hills, Sydney\n(02) 9955 1234\nggbar.com.au');
  });

  it('doesn’t repeat a city the address already ends with', () => {
    expect(venueBlock({ ...gg, address: '23 Walker St, North Sydney' }, 'Sydney')).toBe('GG Bar\n23 Walker St, North Sydney\n(02) 9955 1234\nggbar.com.au');
  });

  it('puts the city after the name when there’s no address', () => {
    expect(venueBlock({ name: 'GG Bar', websiteUrl: 'ggbar.com.au' }, 'Perth')).toBe('GG Bar, Perth\nggbar.com.au');
  });
});
