import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isOurCheckoutSession, checkoutPicture, STRIPE_SITE_TAG } from '@/lib/stripe';
import { countHeld } from '@/lib/capacity';

describe('isOurCheckoutSession', () => {
  // The Stripe account may also take FastmatchLive's payments, whose sessions
  // carry a bookingId too; only this site's are acted on.
  it('is ours when tagged', () => {
    expect(isOurCheckoutSession({ metadata: { bookingId: 'b1', site: STRIPE_SITE_TAG } }, 'https://fastmatch.test')).toBe(true);
  });
  it('is ours, untagged, when it sends the member back to this site (sessions opened before the tag)', () => {
    expect(isOurCheckoutSession({ metadata: { bookingId: 'b1' }, success_url: 'https://fastmatch.test/events/e1/booked?session_id={CHECKOUT_SESSION_ID}' }, 'https://fastmatch.test/')).toBe(true);
  });
  it('isn’t ours otherwise', () => {
    expect(isOurCheckoutSession({ metadata: { bookingId: 'b1' }, success_url: 'https://live.fastmatch.test/x' }, 'https://fastmatch.test')).toBe(false);
    expect(isOurCheckoutSession({ metadata: { bookingId: 'b1' }, success_url: 'https://fastmatch.test.evil.example/x' }, 'https://fastmatch.test')).toBe(false);
    expect(isOurCheckoutSession({ metadata: { bookingId: 'b1', site: 'other' } }, '')).toBe(false);
  });
});

describe('the picture on Stripe’s payment page (Gil, 8 Oct)', () => {
  const site = 'https://fastmatch.test';
  const photo = `${site}/api/uploads/${'a'.repeat(32)}.jpg`;
  const logo = `${site}/api/uploads/${'b'.repeat(32)}.png`;
  const image = `${site}/api/uploads/${'c'.repeat(32)}.jpg`;
  const venue = { logoUrl: logo, imageUrl: image };

  it('is the event’s photo, else the venue’s logo, else the venue’s picture, else none', () => {
    expect(checkoutPicture({ photoUrl: photo }, venue, site)).toBe(photo);
    expect(checkoutPicture({ photoUrl: null }, venue, site)).toBe(logo);
    expect(checkoutPicture({ photoUrl: '  ' }, { logoUrl: '', imageUrl: image }, site)).toBe(image);
    expect(checkoutPicture({ photoUrl: null }, { logoUrl: null, imageUrl: null }, site)).toBeNull();
  });

  it('a picture on the site itself gets the site’s address', () => {
    expect(checkoutPicture({ photoUrl: '/photos/night.jpg' }, venue, site)).toBe(`${site}/photos/night.jpg`);
  });

  it('only a full https address is given to Stripe, which fetches it itself', () => {
    // On a local copy of the site (http) there's no picture, and nothing breaks.
    expect(checkoutPicture({ photoUrl: 'http://localhost:3000/api/uploads/x.jpg' }, { logoUrl: null, imageUrl: null }, 'http://localhost:3000')).toBeNull();
    expect(checkoutPicture({ photoUrl: '/photos/night.jpg' }, { logoUrl: null, imageUrl: null }, undefined)).toBeNull();
    // A bad first choice falls through to the next.
    expect(checkoutPicture({ photoUrl: 'http://old.example/p.jpg' }, venue, site)).toBe(logo);
    expect(checkoutPicture({ photoUrl: `https://fastmatch.test/${'x'.repeat(2100)}.jpg` }, venue, site)).toBe(logo);
  });
});

describe('countHeld excludeEmail', () => {
  it('doesn’t count the person booking for themselves a second time as someone’s friend', () => {
    const held = [{ member: { gender: 'MALE' as const }, pendingFriends: [{ gender: 'FEMALE', email: 'Olivia@Example.com' }, { gender: 'FEMALE', email: 'x@example.com' }] }];
    expect(countHeld(held)).toEqual({ men: 1, women: 2 });
    expect(countHeld(held, { excludeEmail: ' olivia@example.com ' })).toEqual({ men: 1, women: 1 });
  });
});

// ---- The admin confirming an unpaid online booking -------------------------

const calls = vi.hoisted(() => [] as string[]);
const state = vi.hoisted(() => ({ booking: null as any, closeResult: 'closed' as 'closed' | 'paid' | 'throw', updates: [] as any[] }));

vi.mock('../prisma', () => ({
  prisma: {
    booking: {
      findUnique: vi.fn(async () => state.booking && { ...state.booking }),
      updateMany: vi.fn(async (args: any) => { state.updates.push(args); return { count: 1 }; }),
    },
  },
}));
vi.mock('../capacity', async (orig) => ({
  ...(await orig<typeof import('../capacity')>()),
  placesTaken: vi.fn(async () => ({ men: 0, women: 0 })),
}));
vi.mock('../memberBooking', () => ({
  confirmBookingGroup: vi.fn(async () => {
    calls.push('confirm');
    state.booking.status = 'CONFIRMED';
    return { confirmed: true, notifyFailures: [] };
  }),
}));
vi.mock('../pendingBooking', () => ({
  closeCheckout: vi.fn(async () => {
    calls.push('close');
    if (state.closeResult === 'throw') throw new Error('Stripe down');
    return state.closeResult;
  }),
  releasePendingBooking: vi.fn(),
}));

describe('confirmPendingByAdmin', () => {
  beforeEach(() => {
    calls.length = 0;
    state.updates.length = 0;
    state.closeResult = 'closed';
    state.booking = {
      id: 'b1', badge: 7, status: 'PENDING', stripePaymentIntentId: 'cs_1', confirmedAt: null, checkedInAt: null, pendingFriends: null,
      eventId: 'e1', member: { name: 'Olivia', email: 'o@example.com', gender: 'FEMALE' }, event: { maxMen: 12, maxWomen: 12 },
    };
  });
  const payment = { method: 'CASH' as const, paidAmount: 45, checkedIn: true };

  it('confirms first and closes the payment page after (so Stripe’s "expired" can’t remove it mid-way)', async () => {
    const { confirmPendingByAdmin } = await import('../adminBooking');
    const r = await confirmPendingByAdmin('b1', payment);
    expect(calls).toEqual(['confirm', 'close']);
    expect(r).toMatchObject({ ok: true, bookingId: 'b1', badge: 7 });
    expect(state.updates[0].data).toMatchObject({ checkedIn: true, paidAmount: 45, paymentMethod: 'CASH' });
  });

  it('just paid online: recorded as online, but "checked in" still applies, and the admin is told', async () => {
    state.closeResult = 'paid';
    const { confirmPendingByAdmin } = await import('../adminBooking');
    const r = await confirmPendingByAdmin('b1', payment);
    expect(state.updates[0].data).toEqual({ checkedIn: true, checkedInAt: expect.any(Date) });
    expect(r).toMatchObject({ ok: true, notice: expect.stringMatching(/just paid online/) });
  });

  it('a booking confirmed before (old, long-paid page): the admin’s details apply', async () => {
    state.closeResult = 'paid';
    state.booking.confirmedAt = new Date('2026-09-01');
    const { confirmPendingByAdmin } = await import('../adminBooking');
    const r = await confirmPendingByAdmin('b1', payment);
    expect(state.updates[0].data).toMatchObject({ paymentMethod: 'CASH', paidAmount: 45 });
    expect(r).not.toHaveProperty('notice');
  });

  it('still confirmed if Stripe can’t be reached to close the page', async () => {
    state.closeResult = 'throw';
    const { confirmPendingByAdmin } = await import('../adminBooking');
    expect(await confirmPendingByAdmin('b1', payment)).toMatchObject({ ok: true });
  });
});
