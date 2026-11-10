import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { priceBooking } from '@/lib/bookingPrice';
import { payableCutoff, holdCutoff, PAYABLE_MINUTES, CHECKOUT_MINUTES } from '@/lib/capacity';

/**
 * Batch S2 ("money, before Gil's blast"): discount codes used once per
 * member for real, booking presses and code guesses limited, a payment only
 * confirming the booking it was opened for, and the smaller fixes with them.
 * The database, Stripe, rate limits and email are stood in for.
 */

const h = vi.hoisted(() => ({
  bookings: new Map<string, any>(),
  member: null as any,
  event: null as any,
  queries: [] as string[],
  countArgs: [] as any[],
  otherConfirmedWithCode: 0,
  discountUpdates: 0,
  alerts: [] as any[],
  limits: [] as string[],
  deny: new Set<string>(),
  stripe: {
    event: null as any,
    retrieve: null as null | ((id: string) => any),
    expired: [] as string[],
  },
  ratingPresent: [] as string[],
  upserts: [] as any[],
  prepareCalls: 0,
}));

const copy = (b: any) => b && { ...b, member: h.member, event: h.event };

vi.mock('../prisma', () => {
  const booking = {
    findUnique: vi.fn(async ({ where }: any) => {
      if (where.id) return copy(h.bookings.get(where.id));
      const k = where.eventId_memberId;
      return copy([...h.bookings.values()].find((b) => b.eventId === k.eventId && b.memberId === k.memberId));
    }),
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    count: vi.fn(async (args: any) => {
      h.countArgs.push(args);
      return args.where.discountCodeId && args.where.id ? h.otherConfirmedWithCode : 0;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const b = h.bookings.get(where.id);
      if (!b || (where.status && b.status !== where.status) || ('stripePaymentIntentId' in where && b.stripePaymentIntentId !== where.stripePaymentIntentId)) return { count: 0 };
      Object.assign(b, data);
      return { count: 1 };
    }),
    update: vi.fn(async ({ where, data }: any) => Object.assign(h.bookings.get(where.id), data)),
    aggregate: vi.fn(async () => ({ _max: { badge: 1 } })),
    create: vi.fn(async ({ data }: any) => { const b = { id: `b${h.bookings.size + 1}`, ...data }; h.bookings.set(b.id, b); return b; }),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  };
  const prisma: any = {
    booking,
    member: { findMany: vi.fn(async () => []), findUnique: vi.fn(async () => null) },
    event: { findUniqueOrThrow: vi.fn(async () => h.event), findUnique: vi.fn(async () => h.event) },
    eventTheme: { findUnique: vi.fn(async () => ({ name: 'Speed dating' })) },
    discountCode: {
      findUnique: vi.fn(async () => ({ id: 'd1', code: 'FMDC10', type: 'FIXED_REDUCTION', amount: 10, validFrom: new Date(0), validTo: new Date(4e12), scopeThemeId: null, scopeEventId: null })),
      update: vi.fn(async () => { h.discountUpdates++; }),
    },
    city: { findUnique: vi.fn(async () => null) },
    rating: { upsert: vi.fn((args: any) => { h.upserts.push(args); return args; }) },
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => { h.queries.push(strings.join('?')); return []; }),
    $transaction: vi.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
  };
  return { prisma };
});
vi.mock('../stripe', async (orig) => ({
  ...(await orig<typeof import('../stripe')>()),
  getStripeWebhookSecret: () => 'whsec_test',
  getStripe: () => ({
    webhooks: { constructEvent: () => h.stripe.event },
    checkout: {
      sessions: {
        retrieve: vi.fn(async (id: string) => h.stripe.retrieve!(id)),
        expire: vi.fn(async (id: string) => { h.stripe.expired.push(id); }),
        create: vi.fn(async () => ({ id: 'cs_new', url: 'https://checkout.test/cs_new' })),
      },
    },
  }),
}));
vi.mock('../paymentAlerts', () => ({
  alertRefundNeeded: vi.fn(async (a: any) => { h.alerts.push(a); }),
  alertDiscountReused: vi.fn(async (a: any) => { h.alerts.push({ kind: 'discountReused', ...a }); }),
  notifyAutoRefund: vi.fn(),
}));
vi.mock('../sendBookingConfirmation', () => ({ sendBookingConfirmation: vi.fn(async () => {}) }));
vi.mock('../friendShareRefund', () => ({ refundFriendsNotAdded: vi.fn(async () => {}), refundFriendsAlreadyBooked: vi.fn(async () => {}) }));
vi.mock('../emails/send', () => ({ sendEmail: vi.fn(async () => {}) }));
vi.mock('../auth', () => ({ getSessionMember: vi.fn(async () => h.member) }));
vi.mock('../rateLimit', async (orig) => {
  const real = await orig<typeof import('../rateLimit')>();
  return {
    ...real,
    hitRateLimit: vi.fn(async (key: string) => {
      const prefix = key.slice(0, key.indexOf(':'));
      h.limits.push(prefix);
      return { allowed: !h.deny.has(prefix), count: 1, retryAfterSeconds: 60 };
    }),
  };
});

const member = { id: 'm1', name: 'Ann', email: 'ann@example.test', gender: 'FEMALE', dateOfBirth: new Date('1990-01-01'), cityId: null, emailVerified: true, mobileVerified: true, agreedTerms: true };
const event = {
  id: 'e1', name: '28-40 years', themeId: 't1', cityId: 'c1', cost: 49, maxMen: 12, maxWomen: 12, ageMin: 18, ageMax: 99,
  status: 'UPCOMING', visibility: 'PUBLIC', draft: false, startsAt: new Date(Date.now() + 7 * 864e5), fastmatchDiscounts: true, groupDiscounts: true,
  venue: { name: 'Bar', address: '1 St', logoUrl: null, imageUrl: null }, city: { name: 'Sydney' }, theme: { name: 'Speed dating' }, photoUrl: null,
};
const pendingBooking = (over: Record<string, unknown> = {}) => ({
  id: 'b1', eventId: 'e1', memberId: 'm1', badge: 3, status: 'PENDING', paidAmount: 49, pendingFriends: null, discountCodeId: null,
  stripePaymentIntentId: 'cs_1', confirmedAt: null, createdAt: new Date(), reopenedFrom: null, paymentMethod: null, ...over,
});

beforeEach(() => {
  h.bookings.clear();
  h.member = { ...member };
  h.event = { ...event };
  h.queries = []; h.countArgs = []; h.alerts = []; h.limits = []; h.upserts = [];
  h.deny = new Set();
  h.otherConfirmedWithCode = 0;
  h.discountUpdates = 0;
  h.stripe.expired = [];
  h.stripe.retrieve = () => ({ status: 'open' });
});

// ---- Item 21: prices never below nothing -----------------------------------

describe('priceBooking with a code saved before the admin form checked it', () => {
  const base = { cost: 50, memberName: 'Ann', couponAlreadyUsed: false };
  it('150% off takes the member’s own ticket to $0, not below, and friends still pay theirs', () => {
    const q = priceBooking({ ...base, friends: [{ name: 'Pal', gender: 'MALE' }], coupon: { code: 'OLD', type: 'PERCENT_OFF', amount: 150 } });
    expect(q.memberAmount).toBe(0);
    expect(q.total).toBe(40);
    expect(q.lines.at(-1)).toEqual({ label: 'Discount code OLD', amount: -50 });
  });
  it('a negative amount off takes nothing off (it used to add to the price)', () => {
    const q = priceBooking({ ...base, friends: [], coupon: { code: 'NEG', type: 'FIXED_REDUCTION', amount: -20 } });
    expect(q.total).toBe(50);
  });
  it('valid codes price exactly as before', () => {
    expect(priceBooking({ ...base, friends: [], coupon: { code: 'FMDC10', type: 'FIXED_REDUCTION', amount: 10 } }).total).toBe(40);
    expect(priceBooking({ ...base, friends: [], coupon: { code: 'HALF', type: 'PERCENT_OFF', amount: 50 } }).total).toBe(25);
    expect(priceBooking({ ...base, friends: [], coupon: { code: 'FREE', type: 'FREE', amount: null } }).total).toBe(0);
  });
});

// ---- Item 4: once per member, for the payment page's whole life -----------

describe('a discount code on another event’s payment page', () => {
  it('counts as in use for as long as that page could be paid (31 minutes), not just its 10-minute hold', async () => {
    expect(PAYABLE_MINUTES).toBe(CHECKOUT_MINUTES + 1);
    const { lookupDiscount } = await import('../memberBooking');
    const before = Date.now();
    await lookupDiscount(member, event as any, 'FMDC10');
    const pending = h.countArgs[0].where.OR.find((o: any) => o.status === 'PENDING');
    const cutoff = pending.createdAt.gte.getTime();
    expect(cutoff).toBeLessThan(holdCutoff().getTime());
    expect(Math.abs(cutoff - (before - 31 * 60_000))).toBeLessThan(2000);
    expect(pending.eventId).toEqual({ not: 'e1' });
    expect(payableCutoff(new Date(31 * 60_000)).getTime()).toBe(0);
  });

  it('used on another paid booking already: the place is still confirmed, and Gil is told', async () => {
    h.bookings.set('b1', pendingBooking({ discountCodeId: 'd1', paidAmount: 39 }));
    h.otherConfirmedWithCode = 1;
    const { confirmBookingGroup } = await import('../memberBooking');
    const r = await confirmBookingGroup('b1', { sessionId: 'cs_1', expectTotalCents: 3900 });
    expect(r).toMatchObject({ confirmed: true, discountReused: true });
    expect(h.bookings.get('b1').status).toBe('CONFIRMED');
    expect(h.queries.some((q) => q.includes('`Member`') && q.includes('FOR UPDATE'))).toBe(true);
    expect(h.alerts).toHaveLength(1);
    expect(h.alerts[0]).toMatchObject({ kind: 'discountReused', sessionId: 'cs_1', bookingId: 'b1', code: 'FMDC10', discountGiven: 10 });
  });

  it('used for the first time: confirmed, counted once, nobody alerted', async () => {
    h.bookings.set('b1', pendingBooking({ discountCodeId: 'd1', paidAmount: 39 }));
    const { confirmBookingGroup } = await import('../memberBooking');
    expect(await confirmBookingGroup('b1', { sessionId: 'cs_1', expectTotalCents: 3900 })).toMatchObject({ confirmed: true, discountReused: false });
    expect(h.discountUpdates).toBe(1);
    expect(h.alerts).toHaveLength(0);
  });
});

// ---- Item 6: a payment confirms only what it paid for ----------------------

describe('confirmBookingGroup checks what was paid against the booking', () => {
  const friend = { gender: 'MALE', name: 'Pal', email: 'pal@example.test', mobile: '0412345678', dateOfBirth: '1990-01-01', paidAmount: 39 };

  it('the booking’s total: the member’s place plus each friend’s, in cents', async () => {
    const { bookingTotalCents } = await import('../memberBooking');
    expect(bookingTotalCents({ paidAmount: '49.50', pendingFriends: [friend, { ...friend, paidAmount: 39.5 }] as any })).toBe(4950 + 3900 + 3950);
    expect(bookingTotalCents({ paidAmount: 0, pendingFriends: null })).toBe(0);
  });

  it('paid less than the booking now costs (friends added by another press): not confirmed', async () => {
    h.bookings.set('b1', pendingBooking({ pendingFriends: [friend] }));
    const { confirmBookingGroup } = await import('../memberBooking');
    const r = await confirmBookingGroup('b1', { sessionId: 'cs_1', expectTotalCents: 4900 });
    expect(r).toMatchObject({ confirmed: false, amountMismatch: true });
    expect(h.bookings.get('b1').status).toBe('PENDING');
    // Checked with the booking locked, as well as the event.
    expect(h.queries.some((q) => q.includes('`Booking`') && q.includes('FOR UPDATE'))).toBe(true);
  });

  it('the free path confirms only a booking that is still for nothing', async () => {
    h.bookings.set('b1', pendingBooking({ paidAmount: 0, stripePaymentIntentId: null, pendingFriends: [friend] }));
    const { confirmBookingGroup } = await import('../memberBooking');
    expect(await confirmBookingGroup('b1', { expectTotalCents: 0 })).toMatchObject({ confirmed: false, amountMismatch: true });
    h.bookings.set('b1', pendingBooking({ paidAmount: 0, stripePaymentIntentId: null }));
    expect(await confirmBookingGroup('b1', { expectTotalCents: 0 })).toMatchObject({ confirmed: true });
  });

  it('the exact amount confirms, as before', async () => {
    h.bookings.set('b1', pendingBooking());
    const { confirmBookingGroup } = await import('../memberBooking');
    expect(await confirmBookingGroup('b1', { sessionId: 'cs_1', expectTotalCents: 4900 })).toMatchObject({ confirmed: true });
    expect(h.bookings.get('b1').status).toBe('CONFIRMED');
  });
});

describe('the payment page is recorded only on the booking it was opened for', () => {
  const prepared = (total: number, friends: any[] = []) => ({
    ok: true as const, discount: null, friends,
    quote: { total, memberAmount: 49, friendAmount: 39, lines: [], gstIncluded: 0, couponApplied: false },
  });

  it('recorded when the booking still holds what was priced', async () => {
    h.bookings.set('b1', pendingBooking({ stripePaymentIntentId: null }));
    const { attachCheckout } = await import('../memberBooking');
    expect(await attachCheckout('b1', 'cs_9', prepared(49))).toBe(true);
    expect(h.bookings.get('b1').stripePaymentIntentId).toBe('cs_9');
  });

  it('not when another press has put other friends on it, or opened its own page', async () => {
    const { attachCheckout } = await import('../memberBooking');
    h.bookings.set('b1', pendingBooking({ stripePaymentIntentId: null, pendingFriends: [{ email: 'pal@example.test', gender: 'MALE', paidAmount: 39 }] }));
    expect(await attachCheckout('b1', 'cs_9', prepared(49))).toBe(false);
    h.bookings.set('b1', pendingBooking({ stripePaymentIntentId: 'cs_other' }));
    expect(await attachCheckout('b1', 'cs_9', prepared(49))).toBe(false);
    expect(h.bookings.get('b1').stripePaymentIntentId).toBe('cs_other');
  });

  it('a cancelled booking is reopened only once by two presses at the same moment', async () => {
    const { createMemberBooking } = await import('../memberBooking');
    h.bookings.set('b1', pendingBooking({ status: 'CANCELLED', stripePaymentIntentId: null }));
    const findUnique = (await import('../prisma')).prisma.booking.findUnique as any;
    // Both presses read it while it was still cancelled.
    const stale = copy(h.bookings.get('b1'));
    findUnique.mockResolvedValueOnce(stale).mockResolvedValueOnce(stale);
    expect(await createMemberBooking(member, event, prepared(49) as any)).toBe('b1');
    expect(await createMemberBooking(member, event, prepared(127, [{ gender: 'MALE', name: 'P', email: 'p@x.test', mobile: '0412345678', dateOfBirth: '1990-01-01' }]) as any)).toBeNull();
    expect(h.bookings.get('b1').pendingFriends).toBeTruthy(); // DbNull: the first press's (no friends)
    expect(Array.isArray(h.bookings.get('b1').pendingFriends)).toBe(false);
  });
});

// ---- Item 21: closing a page Stripe doesn't know ---------------------------

describe('closeCheckout', () => {
  it('a page Stripe doesn’t know (the test account’s, after going live) counts as closed', async () => {
    const { closeCheckout } = await import('../pendingBooking');
    h.stripe.retrieve = () => { throw Object.assign(new Error('No such checkout.session'), { code: 'resource_missing' }); };
    expect(await closeCheckout({ stripePaymentIntentId: 'cs_test_old' })).toBe('closed');
  });
  it('any other Stripe problem still stops it', async () => {
    const { closeCheckout } = await import('../pendingBooking');
    h.stripe.retrieve = () => { throw Object.assign(new Error('Stripe down'), { code: 'api_error' }); };
    await expect(closeCheckout({ stripePaymentIntentId: 'cs_1' })).rejects.toThrow('Stripe down');
  });
});

// ---- The Stripe webhook ----------------------------------------------------

describe('the Stripe webhook', () => {
  const post = async (session: Record<string, unknown>, type = 'checkout.session.completed') => {
    h.stripe.event = { type, data: { object: { id: 'cs_1', payment_status: 'paid', metadata: { bookingId: 'b1', site: 'fastmatch.com.au' }, ...session } } };
    const { POST } = await import('@/app/api/stripe/webhook/route');
    return POST(new NextRequest('http://x.test/api/stripe/webhook', { method: 'POST', body: '{}', headers: { 'stripe-signature': 't=1,v1=x' } }));
  };

  it('confirms a payment of exactly what the booking costs, in AUD', async () => {
    h.bookings.set('b1', pendingBooking());
    await post({ amount_total: 4900, currency: 'aud' });
    expect(h.bookings.get('b1').status).toBe('CONFIRMED');
    expect(h.alerts).toHaveLength(0);
  });

  it('a different amount: not confirmed, and Gil is told', async () => {
    h.bookings.set('b1', pendingBooking());
    await post({ amount_total: 1000, currency: 'aud' });
    expect(h.bookings.get('b1').status).toBe('PENDING');
    expect(h.alerts).toHaveLength(1);
    expect(h.alerts[0].reason).toMatch(/^10\.00 AUD was paid, which isn't what this booking costs/);
  });

  it('another currency: not confirmed, and Gil is told', async () => {
    h.bookings.set('b1', pendingBooking());
    await post({ amount_total: 4900, currency: 'usd' });
    expect(h.bookings.get('b1').status).toBe('PENDING');
    expect(h.alerts).toHaveLength(1);
  });

  it('an untagged session (another site’s) is left alone', async () => {
    h.bookings.set('b1', pendingBooking());
    await post({ amount_total: 4900, currency: 'aud', metadata: { bookingId: 'b1' }, success_url: 'http://localhost:3000/events/e1/booked' });
    expect(h.bookings.get('b1').status).toBe('PENDING');
    expect(h.alerts).toHaveLength(0);
  });
});

// ---- Items 2 and 5: Book presses and code guesses are limited -------------

describe('POST /api/events/:id/book limits', () => {
  const book = async (body: Record<string, unknown>) => {
    const { POST } = await import('@/app/api/events/[eventId]/book/route');
    return POST(new NextRequest('http://x.test/api/events/e1/book', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ eventId: 'e1' }) });
  };

  it('every press counts first, before any check, and is refused past the limit', async () => {
    h.deny.add('book-try');
    const res = await book({ friends: [] });
    expect(res.status).toBe(429);
    expect(h.limits).toEqual(['book-try']);
    expect(h.countArgs).toHaveLength(0); // nothing looked up
  });

  it('a discount code counts against the same limit as checking one on the event page', async () => {
    h.deny.add('discount-check');
    const res = await book({ discountCode: 'GUESS1', friends: [] });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('You’ve tried a lot of codes just now. Please wait a few minutes and try again.');
    expect(h.limits).toEqual(['book-try', 'discount-check']);
  });

  it('no code: the code limit isn’t touched', async () => {
    h.deny.add('book'); // stop at the existing attempts limit, after the checks
    const res = await book({ friends: [] });
    expect(res.status).toBe(429);
    expect(h.limits).toEqual(['book-try', 'book']);
  });
});

// ---- Item 18: ratings ------------------------------------------------------

describe('POST /api/events/:id/ratings', () => {
  const rate = async (ratings: unknown[]) => {
    const { prisma } = await import('../prisma');
    (prisma.booking.findUnique as any).mockResolvedValueOnce({ status: 'CONFIRMED', checkedIn: true });
    (prisma.booking.findMany as any).mockResolvedValueOnce(['m2', 'm3'].map((id) => ({ memberId: id, member: { gender: 'MALE' } })));
    (prisma.event.findUniqueOrThrow as any).mockResolvedValueOnce({ ...event, ratingAudience: 'OPPOSITE', matchesCalculated: false, startsAt: new Date() });
    const { POST } = await import('@/app/api/events/[eventId]/ratings/route');
    return POST(new NextRequest('http://x.test/api/events/e1/ratings', { method: 'POST', body: JSON.stringify({ ratings }) }), { params: Promise.resolve({ eventId: 'e1' }) });
  };

  it('the same person twice: one write, the last choice', async () => {
    const res = await rate([{ ratedMemberId: 'm2', choice: 'DATE' }, { ratedMemberId: 'm3', choice: 'NO' }, { ratedMemberId: 'm2', choice: 'FRIEND' }]);
    expect(res.status).toBe(200);
    expect(h.upserts.map((u) => [u.create.ratedMemberId, u.create.choice])).toEqual([['m2', 'FRIEND'], ['m3', 'NO']]);
  });

  it('more than 200 choices, or an id far longer than ours, is refused', async () => {
    expect((await rate(Array.from({ length: 201 }, (_, i) => ({ ratedMemberId: `m${i}`, choice: 'NO' })))).status).toBe(400);
    expect((await rate([{ ratedMemberId: 'x'.repeat(41), choice: 'NO' }])).status).toBe(400);
    expect(h.upserts).toHaveLength(0);
  });
});
