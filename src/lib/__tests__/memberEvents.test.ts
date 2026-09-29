import { describe, it, expect } from 'vitest';
import { isProfileMatch, orderForMember, type TableEvent } from '@/lib/memberEvents';

const ev = (id: string, day: number, o: Partial<TableEvent> = {}): TableEvent => ({
  id, startsAt: `2026-10-${String(day).padStart(2, '0')}T09:00:00Z`, ageMin: 30, ageMax: 45, cost: '49', bookedByMe: false, cityId: 'syd', ...o,
});

describe('isProfileMatch', () => {
  it('ticks when the member’s age is inside the event’s range, edges included', () => {
    expect(isProfileMatch({ ageMin: 35, ageMax: 49 }, 35)).toBe(true);
    expect(isProfileMatch({ ageMin: 35, ageMax: 49 }, 49)).toBe(true);
    expect(isProfileMatch({ ageMin: 35, ageMax: 49 }, 34)).toBe(false);
    expect(isProfileMatch({ ageMin: 35, ageMax: 49 }, 50)).toBe(false);
  });
  it('no tick without an age', () => {
    expect(isProfileMatch({ ageMin: 35, ageMax: 49 }, null)).toBe(false);
  });
});

describe('orderForMember', () => {
  const events = [
    ev('syd-later', 20),
    ev('mel', 5, { cityId: 'mel' }),
    ev('booked-later', 25, { bookedByMe: true }),
    ev('syd-soon', 3),
    ev('booked-mel', 10, { bookedByMe: true, cityId: 'mel' }),
  ];

  it('booked events first — from any city — then the chosen city, each soonest first', () => {
    expect(orderForMember(events, 'syd').map((e) => e.id)).toEqual(['booked-mel', 'booked-later', 'syd-soon', 'syd-later']);
  });

  it('every location when no city is chosen', () => {
    expect(orderForMember(events, null).map((e) => e.id)).toEqual(['booked-mel', 'booked-later', 'syd-soon', 'mel', 'syd-later']);
  });
});
