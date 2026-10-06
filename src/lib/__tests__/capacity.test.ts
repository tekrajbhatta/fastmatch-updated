import { describe, it, expect } from 'vitest';
import { countHeld, capacityProblem, holdCutoff, HOLD_MINUTES, CHECKOUT_MINUTES } from '@/lib/capacity';
import { eventAvailability, NOT_BOOKABLE } from '@/lib/eventAvailability';

/**
 * Item 13: an unpaid booking holds places while its 30-minute payment page
 * is open — the member and every friend they're paying for — so two people
 * can't both pay for the last place.
 */
describe('countHeld', () => {
  it('counts the member and each friend on an unpaid booking, by gender', () => {
    expect(countHeld([
      { member: { gender: 'MALE' }, pendingFriends: [{ gender: 'FEMALE' }, { gender: 'MALE' }] },
      { member: { gender: 'FEMALE' }, pendingFriends: null },
    ])).toEqual({ men: 2, women: 2 });
  });

  it('ignores anything odd in the stored friends', () => {
    expect(countHeld([{ member: { gender: 'FEMALE' }, pendingFriends: [null, 'x', { gender: 'OTHER' }, [1]] as never }])).toEqual({ men: 0, women: 1 });
  });
});

describe('holding window', () => {
  // Gil, Q1: a time limit, after which the place is released. Ten minutes on
  // a payment page that stays open for Stripe's minimum of 30; a payment made
  // after the hold, once the event is full, is refunded (confirmBookingGroup).
  it('holds places for the first 10 minutes of the 30-minute payment page', () => {
    expect(HOLD_MINUTES).toBe(10);
    expect(CHECKOUT_MINUTES).toBeGreaterThanOrEqual(30); // Stripe's minimum
    expect(HOLD_MINUTES).toBeLessThan(CHECKOUT_MINUTES);
    const now = new Date('2026-10-09T08:00:00Z');
    expect(now.getTime() - holdCutoff(now).getTime()).toBe(10 * 60 * 1000);
  });
});

describe('capacityProblem', () => {
  const max = { maxMen: 12, maxWomen: 12 };
  it('says which side is full, with the count, like the add screens', () => {
    expect(capacityProblem({ men: 12, women: 3 }, max, { men: 1, women: 0 })).toBe('this event is full for men (12/12)');
    expect(capacityProblem({ men: 3, women: 12 }, max, { men: 0, women: 1 })).toBe('this event is full for women (12/12)');
  });
  it('lets the last place go, and only checks the side being added to', () => {
    expect(capacityProblem({ men: 11, women: 12 }, max, { men: 1, women: 0 })).toBeNull();
    expect(capacityProblem({ men: 12, women: 0 }, max, { men: 0, women: 2 })).toBeNull();
  });
  it('counts a whole group', () => {
    expect(capacityProblem({ men: 10, women: 0 }, max, { men: 3, women: 0 })).toBe('this event is full for men (10/12)');
  });
});

/** Item 12: past, cancelled and hidden events can't be booked, and say why. */
describe('eventAvailability', () => {
  const now = new Date('2026-10-09T08:00:00Z');
  const ev = (over: Partial<{ status: 'UPCOMING' | 'CLOSED' | 'CANCELLED'; visibility: 'PUBLIC' | 'NOT_PUBLIC'; draft: boolean; startsAt: Date }> = {}) => ({
    status: 'UPCOMING' as const, visibility: 'PUBLIC' as const, draft: false, startsAt: new Date('2026-10-09T09:00:00Z'), ...over,
  });
  it('is open before the start', () => expect(eventAvailability(ev(), now)).toBe('open'));
  it('is finished from the start time on', () => {
    expect(eventAvailability(ev({ startsAt: now }), now)).toBe('finished');
    expect(eventAvailability(ev({ startsAt: new Date('2026-10-01T09:00:00Z') }), now)).toBe('finished');
  });
  it('cancelled wins over everything', () => expect(eventAvailability(ev({ status: 'CANCELLED', startsAt: new Date('2026-01-01') }), now)).toBe('cancelled'));
  it('hidden, draft or closed is not open', () => {
    expect(eventAvailability(ev({ visibility: 'NOT_PUBLIC' }), now)).toBe('not-open');
    expect(eventAvailability(ev({ draft: true }), now)).toBe('not-open');
    expect(eventAvailability(ev({ status: 'CLOSED' }), now)).toBe('not-open');
  });
  it('has a message for every reason', () => {
    expect(NOT_BOOKABLE.finished).toMatch(/already started/);
    expect(NOT_BOOKABLE.cancelled).toMatch(/cancelled/);
    expect(NOT_BOOKABLE['not-open']).toMatch(/not open/);
  });
});
