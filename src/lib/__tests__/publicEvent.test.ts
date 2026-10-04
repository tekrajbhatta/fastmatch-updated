import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { toPublicEvent } from '@/lib/publicEvent';

const venue = {
  id: 'v1', name: 'Soultrap Bar', address: '88 Campbell St, Surry Hills', phone: '(02) 9000 0000',
  websiteUrl: 'soultrap.com.au', logoUrl: '/uploads/logo.jpg', imageUrl: '/uploads/img.jpg', description: 'Bar',
  cityId: 'c1', createdAt: new Date(), updatedAt: new Date(),
};
const event = {
  id: 'e1', number: 364, name: '28-40 years', description: 'A fun night', photoUrl: '/uploads/p.jpg',
  themeId: 't1', cityId: 'c1', venueId: 'v1', startsAt: new Date('2026-11-02T08:00:00Z'),
  ageMin: 28, ageMax: 40, maxMen: 12, maxWomen: 12, cost: new Prisma.Decimal(49), expenses: new Prisma.Decimal(300),
  visibility: 'PUBLIC' as const, status: 'UPCOMING' as const, confirmed: true, draft: false,
  fastmatchDiscounts: true, groupDiscounts: true, seriesId: null, matchesCalculated: false,
  matchesCalculatedAt: null, matchEmailsSent: false, createdAt: new Date(), updatedAt: new Date(),
  theme: { id: 't1', name: 'Speed dating', active: true },
  city: { id: 'c1', name: 'Sydney' },
  venue,
};

describe('toPublicEvent', () => {
  it('keeps the business figures and admin flags private', () => {
    const out = toPublicEvent(event, { men: 3, women: 4 }) as Record<string, unknown>;
    for (const key of ['expenses', 'confirmed', 'maxMen', 'maxWomen', 'menBooked', 'womenBooked', '_count', 'draft', 'visibility', 'status', 'seriesId', 'matchesCalculated', 'number']) {
      expect(out).not.toHaveProperty(key);
    }
    const v = out.venue as Record<string, unknown>;
    expect(v).not.toHaveProperty('phone');
    expect(v).not.toHaveProperty('websiteUrl');
    expect(JSON.stringify(out)).not.toContain('300');
  });

  it('still carries everything the pages show', () => {
    const out = toPublicEvent(event, { men: 0, women: 0 });
    expect(out).toMatchObject({
      id: 'e1', name: '28-40 years', ageMin: 28, ageMax: 40, cityId: 'c1',
      theme: { name: 'Speed dating' }, city: { name: 'Sydney' },
      venue: { name: 'Soultrap Bar', address: '88 Campbell St, Surry Hills', logoUrl: '/uploads/logo.jpg' },
    });
  });

  it('is sold out once every place, men and women together, is taken', () => {
    expect(toPublicEvent(event, { men: 12, women: 11 }).soldOut).toBe(false);
    expect(toPublicEvent(event, { men: 12, women: 12 }).soldOut).toBe(true);
    expect(toPublicEvent(event, { men: 13, women: 12 }).soldOut).toBe(true); // overbooked by the admin
  });
});

/**
 * Item 23: a night full for one gender used to offer "Book" to that gender,
 * who then filled in the form and were refused at the last step. A signed-in
 * member is now told it's full for them; anyone else only learns whether the
 * whole night is full.
 */
describe('fullForYou', () => {
  const menFull = { men: 12, women: 5 };
  const womenFull = { men: 5, women: 12 };

  it('is never set for a visitor who isn’t signed in', () => {
    expect(toPublicEvent(event, menFull).fullForYou).toBe(false);
    expect(toPublicEvent(event, womenFull, null).fullForYou).toBe(false);
  });

  it('tells a man when every man’s place is taken, and only then', () => {
    expect(toPublicEvent(event, menFull, 'MALE').fullForYou).toBe(true);
    expect(toPublicEvent(event, { men: 11, women: 12 }, 'MALE').fullForYou).toBe(false);
    expect(toPublicEvent(event, womenFull, 'MALE').fullForYou).toBe(false);
    expect(toPublicEvent(event, { men: 13, women: 0 }, 'MALE').fullForYou).toBe(true); // overbooked by the admin
  });

  it('tells a woman when every woman’s place is taken, and only then', () => {
    expect(toPublicEvent(event, womenFull, 'FEMALE').fullForYou).toBe(true);
    expect(toPublicEvent(event, menFull, 'FEMALE').fullForYou).toBe(false);
  });

  it('doesn’t change "sold out" for everyone else, or reveal any counts', () => {
    expect(toPublicEvent(event, menFull, 'MALE').soldOut).toBe(false);
    const out = toPublicEvent(event, menFull, 'MALE') as Record<string, unknown>;
    expect(Object.values(out).filter((v) => typeof v === 'number' && (v === 12 || v === 5))).toEqual([]);
  });
});
