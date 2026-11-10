import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { bookingConfirmationEmail } from '@/lib/emails/eventEmails';

/**
 * D2 (friend privacy): nothing about someone who already has an account can
 * be learned from the booking form, whatever email address is typed as a
 * friend's. Their own record (booked already, a cancelled booking, their own
 * payment page open, gender, age) is checked only once the booking is paid
 * for; a friend who can't come isn't booked, takes no place, and their share
 * is refunded, the member being told only that they "couldn't be added".
 * Someone's own payment page is never closed by another member's booking.
 * An existing member booked by someone else is told who, and how to cancel.
 *
 * The database, Stripe, rate limits and email are stood in for: a small
 * in-memory database that understands the queries these paths make.
 */

type Row = Record<string, any>;
const h = vi.hoisted(() => ({
  members: [] as Row[],
  bookings: new Map<string, Row>(),
  event: null as Row | null,
  me: null as Row | null,
  sessions: {} as Record<string, { status: string }>,
  retrieved: [] as string[],
  expired: [] as string[],
  created: [] as Row[],
  confirmations: [] as string[],
  emails: [] as Row[],
  refunds: [] as any[],
  memberLookups: 0,
  seq: 0,
}));

vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'hashed'), compare: vi.fn(async () => false) } }));

vi.mock('../prisma', () => {
  const memberOf = (id: string) => h.members.find((m) => m.id === id);
  const isNullish = (v: unknown) => v === null || v === undefined || v === Prisma.DbNull;
  const cond = (v: unknown, c: any): boolean => {
    if (c === null) return isNullish(v);
    if (c && typeof c === 'object' && !(c instanceof Date)) {
      if ('in' in c) return c.in.some((x: unknown) => (typeof x === 'string' && typeof v === 'string' ? x.toLowerCase() === v.toLowerCase() : x === v));
      if ('not' in c) return c.not === null ? !isNullish(v) : v !== c.not;
      if ('gte' in c || 'lt' in c) return (!c.gte || (v as Date) >= c.gte) && (!c.lt || (v as Date) < c.lt);
    }
    return v === c;
  };
  const matches = (b: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([k, c]) => {
      if (k === 'OR') return (c as Row[]).some((w) => matches(b, w));
      if (k === 'member') {
        const m = memberOf(b.memberId);
        return !!m && Object.entries(c as Row).every(([mk, mc]) => cond(m[mk], mc));
      }
      if (k === 'event') return Object.entries(c as Row).every(([ek, ec]) => cond(h.event![ek], ec));
      return cond(b[k], c);
    });
  const withRelations = (b: Row | undefined) => {
    if (!b) return null;
    const lead = b.bookedById ? h.bookings.get(b.bookedById) : null;
    return {
      ...b,
      member: { city: null, ...memberOf(b.memberId) },
      event: h.event,
      bookedBy: lead ? { ...lead, member: memberOf(lead.memberId) } : null,
    };
  };
  const clean = (data: Row) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === Prisma.DbNull ? null : v]));
  const find = (where: Row) =>
    where.id ? h.bookings.get(where.id)
      : where.eventId_memberId
        ? [...h.bookings.values()].find((b) => b.eventId === where.eventId_memberId.eventId && b.memberId === where.eventId_memberId.memberId)
        : undefined;
  const booking = {
    findUnique: vi.fn(async ({ where }: Row) => withRelations(find(where))),
    findUniqueOrThrow: vi.fn(async ({ where }: Row) => {
      const b = withRelations(find(where));
      if (!b) throw new Error('not found');
      return b;
    }),
    findFirst: vi.fn(async ({ where }: Row) => withRelations([...h.bookings.values()].find((b) => matches(b, where)))),
    findMany: vi.fn(async ({ where }: Row) => [...h.bookings.values()].filter((b) => matches(b, where)).map(withRelations)),
    count: vi.fn(async ({ where }: Row) => [...h.bookings.values()].filter((b) => matches(b, where)).length),
    updateMany: vi.fn(async ({ where, data }: Row) => {
      const hit = [...h.bookings.values()].filter((b) => matches(b, where));
      for (const b of hit) Object.assign(b, clean(data));
      return { count: hit.length };
    }),
    update: vi.fn(async ({ where, data }: Row) => Object.assign(h.bookings.get(where.id)!, clean(data))),
    aggregate: vi.fn(async ({ where }: Row) => ({ _max: { badge: Math.max(0, ...[...h.bookings.values()].filter((b) => matches(b, where)).map((b) => b.badge ?? 0)) } })),
    create: vi.fn(async ({ data }: Row) => {
      const b = { id: `nb${++h.seq}`, createdAt: new Date(), confirmedAt: null, stripePaymentIntentId: null, bookedById: null, discountCodeId: null, reopenedFrom: null, pendingFriends: null, ...clean(data) };
      h.bookings.set(b.id, b);
      h.created.push(b);
      return b;
    }),
    delete: vi.fn(async ({ where }: Row) => { h.bookings.delete(where.id); }),
    deleteMany: vi.fn(async ({ where }: Row) => {
      const hit = [...h.bookings.values()].filter((b) => matches(b, where));
      for (const b of hit) h.bookings.delete(b.id);
      return { count: hit.length };
    }),
  };
  const member = {
    findMany: vi.fn(async ({ where }: Row) => { h.memberLookups++; return h.members.filter((m) => cond(m.email, where.email)); }),
    findUnique: vi.fn(async ({ where }: Row) => {
      h.memberLookups++;
      return h.members.find((m) => (where.id ? m.id === where.id : m.email.toLowerCase() === where.email.toLowerCase())) ?? null;
    }),
    create: vi.fn(async ({ data }: Row) => { const m = { id: `nm${++h.seq}`, ...data }; h.members.push(m); return m; }),
  };
  const prisma: Row = {
    booking,
    member,
    event: { findUniqueOrThrow: vi.fn(async () => h.event), findUnique: vi.fn(async () => h.event) },
    city: { findUnique: vi.fn(async () => null) },
    eventTheme: { findUnique: vi.fn(async () => ({ name: 'Speed dating' })) },
    discountCode: { findUnique: vi.fn(async () => null), update: vi.fn() },
    $queryRaw: vi.fn(async () => []),
    $executeRaw: vi.fn(async () => 0),
    $transaction: vi.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
  };
  return { prisma };
});
vi.mock('../stripe', async (orig) => ({
  ...(await orig<typeof import('../stripe')>()),
  getStripe: () => ({
    checkout: {
      sessions: {
        retrieve: vi.fn(async (id: string) => {
          h.retrieved.push(id);
          const s = h.sessions[id];
          if (!s) throw Object.assign(new Error('No such checkout.session'), { code: 'resource_missing' });
          return { id, ...s };
        }),
        expire: vi.fn(async (id: string) => { h.expired.push(id); }),
        create: vi.fn(async () => ({ id: `cs_new${++h.seq}`, url: 'https://checkout.test/pay' })),
      },
    },
  }),
}));
vi.mock('../sendBookingConfirmation', () => ({ sendBookingConfirmation: vi.fn(async (id: string) => { h.confirmations.push(id); }) }));
vi.mock('../emails/send', () => ({ sendEmail: vi.fn(async (m: Row) => { h.emails.push(m); }) }));
vi.mock('../friendShareRefund', () => ({
  refundFriendsNotAdded: vi.fn(async (...args: any[]) => { h.refunds.push(args); }),
  refundFriendsAlreadyBooked: vi.fn(async () => {}),
}));
vi.mock('../paymentAlerts', () => ({ alertDiscountReused: vi.fn(), alertRefundNeeded: vi.fn(), notifyAutoRefund: vi.fn() }));
vi.mock('../auth', () => ({ getSessionMember: vi.fn(async () => h.me) }));
vi.mock('../rateLimit', async (orig) => ({
  ...(await orig<typeof import('../rateLimit')>()),
  hitRateLimit: vi.fn(async () => ({ allowed: true, count: 1, retryAfterSeconds: 60 })),
}));

const YEARS = (n: number) => new Date(Date.now() - n * 365.25 * 864e5);
const MIN = 60_000;
const person = (id: string, email: string, gender: 'MALE' | 'FEMALE', age = 30, extra: Row = {}) =>
  ({ id, name: `Account ${id}`, email, gender, dateOfBirth: YEARS(age), cityId: 'c1', awaitingPasswordSetup: false, ...extra });
const typed = (email: string, gender: 'MALE' | 'FEMALE', name = 'Pal') =>
  ({ gender, name, email, mobile: '0412 345 678', dateOfBirth: YEARS(30).toISOString().slice(0, 10) });
const pendingFriend = (email: string, gender: 'MALE' | 'FEMALE', name = 'Pal') =>
  ({ ...typed(email, gender, name), mobile: '0412345678', paidAmount: 40 });
const addBooking = (b: Row) => h.bookings.set(b.id, {
  eventId: 'e1', badge: h.bookings.size + 1, paidAmount: 0, pendingFriends: null, discountCodeId: null, stripePaymentIntentId: null,
  confirmedAt: null, createdAt: new Date(), reopenedFrom: null, paymentMethod: null, bookedById: null, checkedIn: false, ...b,
});

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.APP_URL = 'https://fastmatch.test';
  h.members = [person('lead', 'lisa@x.test', 'FEMALE')];
  h.bookings.clear();
  h.event = {
    id: 'e1', name: '25-45 years', themeId: 't1', cityId: 'c1', cost: 50, maxMen: 3, maxWomen: 3, ageMin: 25, ageMax: 45,
    status: 'UPCOMING', visibility: 'PUBLIC', draft: false, startsAt: new Date(Date.now() + 7 * 864e5), fastmatchDiscounts: true, groupDiscounts: true,
    venue: { name: 'Bar', address: '1 George St', logoUrl: null, imageUrl: null }, city: { name: 'Sydney' }, theme: { name: 'Speed dating' }, photoUrl: null,
  };
  h.me = { ...h.members[0], emailVerified: true, mobileVerified: true, agreedTerms: true };
  h.sessions = {};
  h.retrieved = []; h.expired = []; h.created = []; h.confirmations = []; h.emails = []; h.refunds = [];
  h.memberLookups = 0;
});

// ---- Before paying: the same answer whoever's address it is -----------------

describe('the booking form, before paying', () => {
  // Someone with an account who couldn't come: registered as a woman, typed as a man.
  const member = () => h.members.push(person('m2', 'jo@x.test', 'FEMALE'));

  it('never looks anyone up, and answers the same for a member’s address as a stranger’s', async () => {
    member();
    const { prepareMemberBooking } = await import('../memberBooking');
    const a = await prepareMemberBooking(h.me as any, h.event as any, { friends: [typed('jo@x.test', 'MALE')] });
    const b = await prepareMemberBooking(h.me as any, h.event as any, { friends: [typed('nobody@x.test', 'MALE')] });
    expect(h.memberLookups).toBe(0);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.quote).toEqual(b.quote);
  });

  it('a mistake in what was typed is still pointed out, the same for both', async () => {
    member();
    const { prepareMemberBooking } = await import('../memberBooking');
    const tooYoung = (email: string) => ({ ...typed(email, 'MALE'), dateOfBirth: YEARS(20).toISOString().slice(0, 10) });
    const a = await prepareMemberBooking(h.me as any, h.event as any, { friends: [tooYoung('jo@x.test')] });
    const b = await prepareMemberBooking(h.me as any, h.event as any, { friends: [tooYoung('nobody@x.test')] });
    expect(a).toEqual(b);
    expect(a).toMatchObject({ ok: false, status: 400, fieldErrors: [{ index: 0, field: 'dateOfBirth' }] });
  });

  it('Book answers alike (status and payment page) for a member’s address and a stranger’s', async () => {
    member();
    const { POST } = await import('@/app/api/events/[eventId]/book/route');
    const book = async (email: string) => {
      h.bookings.clear();
      const res = await POST(new NextRequest('http://x.test/api/events/e1/book', { method: 'POST', body: JSON.stringify({ friends: [typed(email, 'MALE')] }) }), { params: Promise.resolve({ eventId: 'e1' }) });
      const body = await res.json();
      return { status: res.status, checkoutUrl: body.checkoutUrl, keys: Object.keys(body).sort() };
    };
    const a = await book('jo@x.test');
    const b = await book('nobody@x.test');
    expect(a).toEqual(b);
    expect(a).toMatchObject({ status: 200, checkoutUrl: 'https://checkout.test/pay' });
    expect(h.memberLookups).toBe(0);
  });
});

// ---- Their own record decides, once it's paid --------------------------------

describe('friendCantComeReason', () => {
  const event = { ageMin: 25, ageMax: 45 };
  it('gives Gil the reason, or null when they can come', async () => {
    const { friendCantComeReason } = await import('../memberBooking');
    const acct = { gender: 'MALE', dateOfBirth: YEARS(30) };
    expect(friendCantComeReason(acct, null, { gender: 'MALE' }, event)).toBeNull();
    expect(friendCantComeReason(acct, { status: 'CONFIRMED' }, { gender: 'MALE' }, event)).toBe('they were already booked into this event');
    expect(friendCantComeReason(acct, { status: 'REFUNDED' }, { gender: 'MALE' }, event)).toMatch(/cancelled or refunded booking/);
    expect(friendCantComeReason(acct, { status: 'PENDING' }, { gender: 'MALE' }, event)).toMatch(/own booking for this event, waiting for its payment/);
    expect(friendCantComeReason(acct, null, { gender: 'FEMALE' }, event)).toBe("they're registered as male, but were booked as female");
    expect(friendCantComeReason({ gender: 'MALE', dateOfBirth: YEARS(60) }, null, { gender: 'MALE' }, event)).toMatch(/makes them 6\d, outside this event's ages \(25 to 45\)/);
  });
});

describe('confirming a paid group booking', () => {
  // The member (a woman) paid for six friends at $40 each. The event takes 3
  // men and 3 women: there's only room because those who can't come take no place.
  function setUp() {
    h.members.push(
      person('m1', 'booked@x.test', 'MALE'),
      person('m2', 'jo@x.test', 'FEMALE'), // typed as a man
      person('m3', 'old@x.test', 'MALE', 70),
      person('m4', 'paying@x.test', 'FEMALE'),
      person('m6', 'ok@x.test', 'FEMALE'),
    );
    addBooking({ id: 'bf1', memberId: 'm1', status: 'CONFIRMED', paidAmount: 50, confirmedAt: new Date() });
    // Paying for her own place right now: her page must stay open.
    addBooking({ id: 'bf4', memberId: 'm4', status: 'PENDING', paidAmount: 50, stripePaymentIntentId: 'cs_f4', createdAt: new Date(Date.now() - 2 * MIN) });
    h.sessions.cs_f4 = { status: 'open' };
    addBooking({
      id: 'lead', memberId: 'lead', status: 'PENDING', paidAmount: 50, stripePaymentIntentId: 'cs_lead',
      pendingFriends: [
        pendingFriend('Booked@x.test', 'MALE', 'Ben'),
        pendingFriend('jo@x.test', 'MALE', 'Joe'),
        pendingFriend('old@x.test', 'MALE', 'Olly'),
        pendingFriend('paying@x.test', 'FEMALE', 'Pam'),
        pendingFriend('new@x.test', 'MALE', 'Ned'),
        pendingFriend('ok@x.test', 'FEMALE', 'Kim'),
      ],
    });
  }

  it('books those who can come, leaves the others out (and their places free), and refunds their shares', async () => {
    setUp();
    const { confirmBookingGroup } = await import('../memberBooking');
    const r = await confirmBookingGroup('lead', { sessionId: 'cs_lead', expectTotalCents: 50_00 + 6 * 40_00 });
    expect(r).toMatchObject({ confirmed: true });
    expect(r.full).toBeUndefined();
    expect(h.bookings.get('lead')!.status).toBe('CONFIRMED');

    const notAdded = r.friendsNotAdded!.map((f) => [f.name, f.amount]);
    expect(notAdded).toEqual([['Ben', 40], ['Joe', 40], ['Olly', 40], ['Pam', 40]]);
    expect(r.friendsAlreadyBooked).toEqual(r.friendsNotAdded); // the old name, for the admin's screen
    expect(r.friendsNotAdded!.map((f) => f.reason)).toEqual([
      'they were already booked into this event',
      "they're registered as female, but were booked as male",
      expect.stringMatching(/makes them 7\d, outside this event's ages/),
      'they have their own booking for this event, waiting for its payment',
    ]);
    expect(h.refunds).toEqual([['lead', 'cs_lead', r.friendsNotAdded]]);

    // Booked: the new friend (a new account) and the member who could come.
    const friendBookings = h.created.filter((b) => b.bookedById === 'lead');
    const ned = h.members.find((m) => m.email === 'new@x.test')!;
    expect(friendBookings.map((b) => b.memberId).sort()).toEqual(['m6', ned.id].sort());
    expect(ned).toMatchObject({ awaitingPasswordSetup: true, gender: 'MALE' });

    // Nobody else's booking touched; her payment page still open.
    expect(h.bookings.get('bf1')).toMatchObject({ status: 'CONFIRMED', memberId: 'm1' });
    expect(h.bookings.get('bf4')).toMatchObject({ status: 'PENDING', stripePaymentIntentId: 'cs_f4' });
    expect(h.expired).toEqual([]);
    expect(h.retrieved).not.toContain('cs_f4');
    // The existing member booked is sent the normal confirmation (which says who booked them).
    expect(h.confirmations).toContain(friendBookings.find((b) => b.memberId === 'm6')!.id);
  });

  it('with nothing paid online (a free booking, or the admin), nothing is refunded here: the caller tells them', async () => {
    setUp();
    const lead = h.bookings.get('lead')!;
    lead.stripePaymentIntentId = null;
    lead.paidAmount = 0;
    lead.pendingFriends = lead.pendingFriends.map((f: Row) => ({ ...f, paidAmount: 0 }));
    const { confirmBookingGroup } = await import('../memberBooking');
    const r = await confirmBookingGroup('lead', { expectTotalCents: 0 });
    expect(r.confirmed).toBe(true);
    expect(r.friendsNotAdded).toHaveLength(4);
    expect(h.refunds).toEqual([]);
  });

  it('a friend’s own unpaid booking whose page has expired is cleared, and they are booked as a friend', async () => {
    h.members.push(person('m4', 'paying@x.test', 'FEMALE'));
    addBooking({ id: 'bf4', memberId: 'm4', status: 'PENDING', paidAmount: 50, stripePaymentIntentId: 'cs_f4', createdAt: new Date(Date.now() - 40 * MIN) });
    h.sessions.cs_f4 = { status: 'expired' };
    addBooking({ id: 'lead', memberId: 'lead', status: 'PENDING', paidAmount: 50, stripePaymentIntentId: 'cs_lead', pendingFriends: [pendingFriend('paying@x.test', 'FEMALE', 'Pam')] });
    const { confirmBookingGroup } = await import('../memberBooking');
    const r = await confirmBookingGroup('lead', { sessionId: 'cs_lead', expectTotalCents: 90_00 });
    expect(r.confirmed).toBe(true);
    expect(r.friendsNotAdded).toEqual([]);
    expect(h.bookings.has('bf4')).toBe(false);
    expect(h.created.filter((b) => b.bookedById === 'lead').map((b) => b.memberId)).toEqual(['m4']);
    expect(h.expired).toEqual([]);
  });
});

// ---- Someone's own payment page is never closed by another's booking --------

describe('releaseAbandonedBooking', () => {
  const pending = (over: Row = {}) => {
    addBooking({ id: 'p1', memberId: 'm4', status: 'PENDING', stripePaymentIntentId: 'cs_p1', createdAt: new Date(Date.now() - 40 * MIN), ...over });
    return h.bookings.get('p1')!;
  };

  it('leaves alone a page that could still be paid (without asking Stripe), one still open or just paid, and a booking confirmed before', async () => {
    const { releaseAbandonedBooking } = await import('../pendingBooking');
    expect(await releaseAbandonedBooking(pending({ createdAt: new Date(Date.now() - 5 * MIN) }) as any)).toBe('kept');
    expect(h.retrieved).toEqual([]);
    for (const status of ['open', 'complete']) {
      h.sessions.cs_p1 = { status };
      expect(await releaseAbandonedBooking(pending() as any)).toBe('kept');
    }
    expect(await releaseAbandonedBooking(pending({ confirmedAt: new Date('2026-10-01'), stripePaymentIntentId: null }) as any)).toBe('kept');
    expect(h.bookings.has('p1')).toBe(true);
    expect(h.expired).toEqual([]);
  });

  it('clears one whose page has expired, or that Stripe doesn’t know', async () => {
    const { releaseAbandonedBooking } = await import('../pendingBooking');
    h.sessions.cs_p1 = { status: 'expired' };
    expect(await releaseAbandonedBooking(pending() as any)).toBe('released');
    expect(h.bookings.has('p1')).toBe(false);
    expect(await releaseAbandonedBooking(pending({ stripePaymentIntentId: 'cs_gone' }) as any)).toBe('released');
    expect(h.bookings.has('p1')).toBe(false);
    expect(h.expired).toEqual([]);
  });
});

// ---- Booked by someone else: told who, and how to cancel ---------------------

describe('the booking confirmation of a member someone else booked', () => {
  const base = { memberName: 'Jo', eventName: 'Speed dating, 25-45 years', venue: 'Bar', startsAt: new Date('2026-11-14T08:30:00Z'), checkInUrl: 'https://x.test/c', timeZone: 'Australia/Sydney' };

  it('says who booked them and how to have it cancelled (names escaped)', () => {
    const { html } = bookingConfirmationEmail({ ...base, bookedByName: 'Lisa <b>' });
    expect(html).toContain('Lisa &lt;b&gt; booked this place for you. Not expecting this? Email <a href="mailto:gil@fastmatch.com.au">gil@fastmatch.com.au</a> and we\'ll cancel it.');
    expect(bookingConfirmationEmail(base).html).not.toContain('Not expecting this');
  });

  it('is said for a place booked by another member, not for their own', async () => {
    h.members.push(person('m6', 'ok@x.test', 'FEMALE'));
    addBooking({ id: 'lead', memberId: 'lead', status: 'CONFIRMED' });
    addBooking({ id: 'fb', memberId: 'm6', status: 'CONFIRMED', bookedById: 'lead' });
    addBooking({ id: 'own', memberId: 'm6', eventId: 'e2', status: 'CONFIRMED' });
    const { sendBookingConfirmation } = await vi.importActual<typeof import('../sendBookingConfirmation')>('../sendBookingConfirmation');
    await sendBookingConfirmation('fb');
    await sendBookingConfirmation('own');
    expect(h.emails[0]).toMatchObject({ to: 'ok@x.test' });
    expect(h.emails[0].html).toContain('Account lead booked this place for you. Not expecting this?');
    expect(h.emails[1].html).not.toContain('Not expecting this');
  });
});

// ---- After paying: what the member sees --------------------------------------

describe('after paying', () => {
  it('my-booking counts only the friends actually booked, and nothing about them', async () => {
    addBooking({ id: 'lead', memberId: 'lead', status: 'CONFIRMED' });
    addBooking({ id: 'f1', memberId: 'm6', status: 'CONFIRMED', bookedById: 'lead' });
    addBooking({ id: 'f2', memberId: 'm7', status: 'CANCELLED', bookedById: 'lead' });
    const { GET } = await import('@/app/api/events/[eventId]/my-booking/route');
    const res = await GET(new NextRequest('http://x.test/api/events/e1/my-booking'), { params: Promise.resolve({ eventId: 'e1' }) });
    expect(await res.json()).toEqual({ status: 'CONFIRMED', friendsBooked: 1 });
  });

  it('a free booking tells the member about friends who couldn’t be added (nothing to refund)', async () => {
    h.event!.cost = 0;
    h.members.push(person('m2', 'jo@x.test', 'FEMALE'));
    const { POST } = await import('@/app/api/events/[eventId]/book/route');
    const res = await POST(
      new NextRequest('http://x.test/api/events/e1/book', { method: 'POST', body: JSON.stringify({ friends: [typed('jo@x.test', 'MALE', 'Joe'), typed('new@x.test', 'MALE', 'Ned')] }) }),
      { params: Promise.resolve({ eventId: 'e1' }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ checkoutUrl: null });
    expect(h.refunds).toHaveLength(1);
    const [leadId, sessionId, friends] = h.refunds[0];
    expect(h.bookings.get(leadId)!.status).toBe('CONFIRMED');
    expect(sessionId).toBeNull();
    expect(friends.map((f: Row) => [f.name, f.amount])).toEqual([['Joe', 0]]);
  });

  it('the booked page says how many friends are booked, and if any couldn’t be added, never why', async () => {
    const { readFileSync } = await import('fs');
    const path = await import('path');
    const page = readFileSync(path.resolve(__dirname, '../../app/events/[eventId]/booked/page.tsx'), 'utf8');
    expect(page).toContain('friends are booked in with you too.');
    expect(page).toContain('to this booking: we’ve emailed you the details.');
    expect(page).not.toMatch(/already booked|registered as|date of birth/);
  });
});
