import type { Gender, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from './prisma';

/**
 * How long Stripe's payment page stays open: 30 minutes, the shortest Stripe
 * allows. It used to stay open for 24 hours, holding nothing, so a late or
 * simultaneous payment could overfill an event.
 */
export const CHECKOUT_MINUTES = 30;

/**
 * How long an unpaid booking holds its places while its payment page is open
 * (Gil, Q1: "a time limit to book… after that the place is released"). It
 * used to hold them for the page's whole 30 minutes, so an abandoned page
 * kept a place from everyone else for half an hour.
 *
 * Ten minutes, not Gil's two: typing card details and the bank's security
 * check (often an approval in the bank's app) commonly take a few minutes,
 * and a hold that runs out mid-payment can cost that person their place.
 * Ten covers almost everyone paying for real, and frees an abandoned place
 * three times sooner than before (the user left the length to me, 6 Oct).
 *
 * After it, the page can still be paid for while there's room. If the places
 * have gone, its page is closed (closeLapsedCheckouts), and a payment that
 * still lands is refunded rather than booked (confirmBookingGroup).
 */
export const HOLD_MINUTES = 10;

export interface PlacesTaken { men: number; women: number }

type Db = PrismaClient | Prisma.TransactionClient;

interface HeldBooking {
  member: { gender: Gender };
  pendingFriends: Prisma.JsonValue;
}

/**
 * The people an unpaid booking is holding places for: the member and the
 * friends they're paying for. `excludeEmail` leaves out a friend with that
 * address — the person now booking for themselves, who'd otherwise count twice.
 */
export function countHeld(bookings: HeldBooking[], opts: { excludeEmail?: string } = {}): PlacesTaken {
  const skip = opts.excludeEmail?.trim().toLowerCase();
  const taken = { men: 0, women: 0 };
  const add = (g: unknown) => {
    if (g === 'MALE') taken.men++;
    else if (g === 'FEMALE') taken.women++;
  };
  for (const b of bookings) {
    add(b.member.gender);
    const friends = Array.isArray(b.pendingFriends) ? b.pendingFriends : [];
    for (const f of friends) {
      if (!f || typeof f !== 'object' || Array.isArray(f)) continue;
      const friend = f as Record<string, unknown>;
      if (skip && typeof friend.email === 'string' && friend.email.trim().toLowerCase() === skip) continue;
      add(friend.gender);
    }
  }
  return taken;
}

/** The oldest an unpaid booking can be and still hold places. */
export function holdCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - HOLD_MINUTES * 60 * 1000);
}

/**
 * Places taken at an event, by gender: every paid booking, plus everyone on
 * an unpaid booking whose payment page is still open.
 *
 * `excludeMemberId` leaves out that member's own unpaid booking — someone
 * trying again, or looking at the event they're paying for, mustn't be
 * blocked by their own earlier attempt — and `excludeEmail` the same person
 * as a friend on someone else's. `excludeBookingId` leaves out one booking
 * (an admin confirming it by hand).
 */
export async function placesTaken(
  eventId: string,
  opts: { db?: Db; now?: Date; excludeMemberId?: string; excludeEmail?: string; excludeBookingId?: string } = {},
): Promise<PlacesTaken> {
  const db = opts.db ?? prisma;
  const [men, women, held] = await Promise.all([
    db.booking.count({ where: { eventId, status: 'CONFIRMED', member: { gender: 'MALE' } } }),
    db.booking.count({ where: { eventId, status: 'CONFIRMED', member: { gender: 'FEMALE' } } }),
    db.booking.findMany({
      where: {
        eventId,
        status: 'PENDING',
        createdAt: { gte: holdCutoff(opts.now) },
        ...(opts.excludeMemberId ? { memberId: { not: opts.excludeMemberId } } : {}),
        ...(opts.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}),
      },
      select: { member: { select: { gender: true } }, pendingFriends: true },
    }),
  ]);
  const h = countHeld(held, { excludeEmail: opts.excludeEmail });
  return { men: men + h.men, women: women + h.women };
}

/** "This event is full for men (12/12)", or null if everyone fits. */
export function capacityProblem(
  taken: PlacesTaken,
  max: { maxMen: number; maxWomen: number },
  adding: PlacesTaken,
): string | null {
  if (adding.men > 0 && taken.men + adding.men > max.maxMen) return `this event is full for men (${taken.men}/${max.maxMen})`;
  if (adding.women > 0 && taken.women + adding.women > max.maxWomen) return `this event is full for women (${taken.women}/${max.maxWomen})`;
  return null;
}
