import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Batch 11 (review item 5): matches are only between people still on the
 * night — a confirmed, checked-in booking each. Someone Gil cancelled,
 * refunded or unticked after making choices isn't matched, so nobody gets
 * their contact details, nor they anyone's. The database is stood in for.
 */
const h = vi.hoisted(() => ({
  bookings: [] as { memberId: string }[],
  ratings: [] as { raterId: string; ratedMemberId: string; choice: string }[],
  created: [] as any[],
}));
vi.mock('../prisma', () => ({
  prisma: {
    event: {
      findUniqueOrThrow: vi.fn(async () => ({ id: 'e1', matchesCalculated: false, ratingAudience: 'OPPOSITE_GENDER' })),
      update: vi.fn(async () => ({})),
    },
    booking: { findMany: vi.fn(async () => h.bookings) },
    rating: { findMany: vi.fn(async () => h.ratings) },
    member: {
      findMany: vi.fn(async ({ where }: any) => (where.id.in as string[]).map((id) => ({ id, gender: id.startsWith('m') ? 'MALE' : 'FEMALE' }))),
    },
    match: { upsert: vi.fn((args: any) => { h.created.push(args.create); return args; }) },
    $transaction: vi.fn(async (ops: any[]) => ops),
  },
}));

beforeEach(() => {
  h.created = [];
  h.ratings = [
    { raterId: 'm1', ratedMemberId: 'f1', choice: 'DATE' }, { raterId: 'f1', ratedMemberId: 'm1', choice: 'DATE' },
    { raterId: 'm2', ratedMemberId: 'f1', choice: 'DATE' }, { raterId: 'f1', ratedMemberId: 'm2', choice: 'DATE' },
  ];
});

describe('calculateMatchesForEvent', () => {
  it('matches everyone still on the night', async () => {
    h.bookings = [{ memberId: 'm1' }, { memberId: 'm2' }, { memberId: 'f1' }];
    const { calculateMatchesForEvent } = await import('../calculateMatches');
    const r = await calculateMatchesForEvent('e1');
    expect(r.matchesCreated).toBe(2);
  });

  it('leaves out someone removed after making choices (cancelled, refunded or unticked)', async () => {
    // m2's booking no longer counts: not among the confirmed, checked-in bookings.
    h.bookings = [{ memberId: 'm1' }, { memberId: 'f1' }];
    const { calculateMatchesForEvent } = await import('../calculateMatches');
    const r = await calculateMatchesForEvent('e1');
    expect(r.matchesCreated).toBe(1);
    expect(h.created).toEqual([expect.objectContaining({ memberAId: 'f1', memberBId: 'm1', result: 'DATE' })]);
  });
});
