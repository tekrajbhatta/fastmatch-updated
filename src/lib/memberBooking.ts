import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { DiscountCode, Event, Member } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { discountAppliesTo } from './discountScope';
import { calculateAge } from './age';
import { venueLine } from './venue';
import { priceBooking, MAX_FRIENDS_PER_GENDER, type PriceQuote } from './bookingPrice';
import { validateFriends, parseDateOfBirth, type FriendInput, type FriendFieldError } from './friendBooking';
import { releasePendingBooking, closeCheckout, dropUnpaidBooking, closeLapsedCheckouts, type ReopenedFrom } from './pendingBooking';
import { sendBookingConfirmation } from './sendBookingConfirmation';
import { refundFriendsAlreadyBooked, type FriendAlreadyBooked } from './friendShareRefund';
import { sendEmail } from './emails/send';
import { friendWelcomeEmail } from './emails/friendEmail';
import { eventTimeFor } from './timezone';
import { eventLabel } from './eventLabel';
import { placesTaken, countHeld, capacityProblem, holdCutoff } from './capacity';
import { eventAvailability, NOT_BOOKABLE } from './eventAvailability';

/**
 * A member booking themselves — and, where the event allows it, friends —
 * online. Shared by /api/events/:id/book and the Stripe webhook.
 *
 * Lifecycle (Gil: "until the payment is done keep the booking pending so
 * that other members can book it"):
 *   1. book    — the member's booking is created PENDING. Friends are only
 *                recorded on it (pendingFriends). For its first 10 minutes on
 *                the 30-minute payment page it holds places for everyone on
 *                it (see src/lib/capacity.ts).
 *   2. payment — confirmBookingGroup() confirms the member, creates each
 *                friend's account (if new) and booking, and emails everyone.
 *   Abandoned  — the payment page expires and Stripe tells us, and the unpaid
 *                booking is removed (it's also replaced if they try again).
 */

export const bookingBodySchema = z.object({
  discountCode: z.string().max(50).optional(),
  friends: z
    .array(
      z.object({
        gender: z.enum(['MALE', 'FEMALE']),
        name: z.string().max(100),
        mobile: z.string().max(30),
        email: z.string().max(200),
        dateOfBirth: z.string().max(10),
      }),
    )
    .max(10)
    .default([]),
});

/** What's stored on the member's booking for each friend until payment. */
interface PendingFriend {
  gender: 'MALE' | 'FEMALE';
  name: string;
  email: string;
  mobile: string;
  dateOfBirth: string;
  paidAmount: number;
}

/**
 * Is this code usable by this member on this event? An invalid code is an
 * error; a valid code the member has already used is NOT — it books at no
 * discount and the summary says so.
 */
export async function lookupDiscount(
  member: Pick<Member, 'id'>,
  event: Pick<Event, 'id' | 'themeId' | 'fastmatchDiscounts'>,
  rawCode: string,
): Promise<{ ok: false; error: string } | { ok: true; discount: DiscountCode; alreadyUsed: boolean }> {
  if (!event.fastmatchDiscounts) return { ok: false, error: "Discount codes can't be used for this event." };
  const discount = await prisma.discountCode.findUnique({ where: { code: rawCode.trim() } });
  if (!discount || !discountAppliesTo(discount, event, new Date())) {
    return { ok: false, error: 'This discount code is not valid for this event.' };
  }
  // One use per member. A CONFIRMED booking counts — an abandoned checkout
  // mustn't burn someone's code — and so does one being paid for right now
  // on another event's payment page (still within its hold): two pages open
  // at once used to get the discount twice. This event's own earlier attempt
  // doesn't, as this booking replaces it.
  const alreadyUsed =
    (await prisma.booking.count({
      where: {
        memberId: member.id,
        discountCodeId: discount.id,
        OR: [{ status: 'CONFIRMED' }, { status: 'PENDING', createdAt: { gte: holdCutoff() }, eventId: { not: event.id } }],
      },
    })) > 0;
  return { ok: true, discount, alreadyUsed };
}

export type Prepared =
  | { ok: false; status: number; error: string; fieldErrors?: FriendFieldError[] }
  | { ok: true; quote: PriceQuote; discount: DiscountCode | null; friends: FriendInput[] };

/** Why a friend who is a member can't be added, without saying which reason it is (Gil, 7 Oct). */
export const FRIEND_CANT_BE_ADDED =
  'Sorry, this friend can’t be added to your booking. Please check their details, or ask them to book their own place. If you need a hand, contact gil@fastmatch.com.au.';

export async function prepareMemberBooking(
  member: Pick<Member, 'id' | 'name' | 'email' | 'gender'>,
  event: Event,
  input: { discountCode?: string; friends: FriendInput[] },
): Promise<Prepared> {
  const availability = eventAvailability(event);
  if (availability !== 'open') return { ok: false, status: 400, error: NOT_BOOKABLE[availability] };

  // ---- discount code
  let discount: DiscountCode | null = null;
  let alreadyUsed = false;
  if (input.discountCode?.trim()) {
    const found = await lookupDiscount(member, event, input.discountCode);
    if (!found.ok) return { ok: false, status: 400, error: found.error };
    discount = found.discount;
    alreadyUsed = found.alreadyUsed;
  }

  // ---- friends
  const friends = input.friends;
  if (friends.length > 0 && !event.groupDiscounts) {
    return { ok: false, status: 400, error: "Bringing friends isn't available for this event." };
  }
  const men = friends.filter((f) => f.gender === 'MALE').length;
  const women = friends.length - men;
  if (men > MAX_FRIENDS_PER_GENDER || women > MAX_FRIENDS_PER_GENDER) {
    return { ok: false, status: 400, error: `You can bring up to ${MAX_FRIENDS_PER_GENDER} male and ${MAX_FRIENDS_PER_GENDER} female friends.` };
  }

  const fieldErrors = validateFriends(friends, { ageMin: event.ageMin, ageMax: event.ageMax, memberEmail: member.email });

  // A friend who already has an account is booked on that account, and their
  // real record — not what was typed — decides whether they can come. One
  // general message whatever the reason (Gil, 7 Oct): a message for each
  // ("already booked", "registered as female", "date of birth on file…")
  // told any member who is on FastMatch, their gender and roughly their age.
  const emails = friends.map((f) => f.email.trim().toLowerCase()).filter(Boolean);
  const existing = emails.length ? await prisma.member.findMany({ where: { email: { in: emails } } }) : [];
  const byEmail = new Map(existing.map((m) => [m.email.toLowerCase(), m]));
  const theirBookings = existing.length
    ? await prisma.booking.findMany({ where: { eventId: event.id, memberId: { in: existing.map((m) => m.id) } } })
    : [];

  friends.forEach((f, index) => {
    const m = byEmail.get(f.email.trim().toLowerCase());
    if (!m || fieldErrors.some((e) => e.index === index && e.field === 'email')) return;
    const b = theirBookings.find((x) => x.memberId === m.id);
    // An unpaid booking of theirs doesn't count — it's released when this
    // one is paid.
    const age = calculateAge(m.dateOfBirth);
    const cantCome =
      b?.status === 'CONFIRMED' || // already booked
      (b && b.status !== 'PENDING') || // an earlier booking was cancelled (Gil rebooks those)
      m.gender !== f.gender || // registered as the other gender
      age < event.ageMin || age > event.ageMax; // outside the age range, by their date of birth on file
    if (cantCome) fieldErrors.push({ index, field: 'email', message: FRIEND_CANT_BE_ADDED });
  });

  if (fieldErrors.length > 0) {
    return { ok: false, status: 400, error: 'Please check your friends’ details.', fieldErrors };
  }

  // ---- a women-only or men-only night (Gil, 7 Oct)
  const only = event.maxMen === 0 ? 'women' : event.maxWomen === 0 ? 'men' : null;
  if (only) {
    const theirs = member.gender === 'MALE' ? event.maxMen : event.maxWomen;
    if (theirs === 0) return { ok: false, status: 409, error: `This event is for ${only} only.` };
    if ((men > 0 && event.maxMen === 0) || (women > 0 && event.maxWomen === 0)) {
      return { ok: false, status: 400, error: `This event is for ${only} only, so you can only bring ${only === 'women' ? 'female' : 'male'} friends.` };
    }
  }

  // ---- capacity: paid places, and places held by payment pages still open
  // (not this member's own earlier attempt, which this booking replaces).
  const { men: menBooked, women: womenBooked } = await placesTaken(event.id, { excludeMemberId: member.id, excludeEmail: member.email });
  const wantMen = men + (member.gender === 'MALE' ? 1 : 0);
  const wantWomen = women + (member.gender === 'FEMALE' ? 1 : 0);
  // Only the side(s) this booking adds to: the women's side being over its
  // maximum (lowered by the admin, say) doesn't stop a man booking alone.
  const menShort = wantMen > 0 && menBooked + wantMen > event.maxMen;
  const womenShort = wantWomen > 0 && womenBooked + wantWomen > event.maxWomen;
  if (menShort || womenShort) {
    if (friends.length === 0) return { ok: false, status: 409, error: 'This event is full for your gender.' };
    const short = menShort ? 'men' : 'women';
    return { ok: false, status: 409, error: `Sorry, there aren't enough places left for ${short} at this event for everyone in your booking.` };
  }

  const quote = priceBooking({
    cost: Number(event.cost),
    memberName: member.name,
    friends: friends.map((f) => ({ name: f.name.trim(), gender: f.gender })),
    coupon: discount ? { code: discount.code, type: discount.type, amount: discount.amount == null ? null : Number(discount.amount) } : null,
    couponAlreadyUsed: alreadyUsed,
  });

  return { ok: true, quote, discount: quote.couponApplied ? discount : null, friends };
}

/**
 * The member's booking, PENDING, with their friends recorded on it. A booking
 * of theirs that was cancelled or refunded is reopened rather than a new one
 * made (one booking row per member per event), keeping its badge, and what it
 * was is kept too: if this payment never comes, it goes back to exactly that
 * (dropUnpaidBooking) instead of the refund record disappearing.
 */
export async function createMemberBooking(
  member: Pick<Member, 'id'>,
  event: Pick<Event, 'id'>,
  prepared: Extract<Prepared, { ok: true }>,
  opts: { holdSince?: Date } = {},
): Promise<string> {
  const pending: PendingFriend[] = prepared.friends.map((f) => ({
    gender: f.gender,
    name: f.name.trim(),
    email: f.email.trim(),
    mobile: f.mobile.trim(),
    dateOfBirth: f.dateOfBirth.trim(),
    paidAmount: prepared.quote.friendAmount,
  }));
  const fresh = {
    status: 'PENDING' as const,
    paidAmount: prepared.quote.memberAmount,
    discountCodeId: prepared.discount?.id ?? null,
    pendingFriends: pending.length ? (pending as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
  };
  const old = await prisma.booking.findUnique({ where: { eventId_memberId: { eventId: event.id, memberId: member.id } } });
  if (old && (old.status === 'CANCELLED' || old.status === 'REFUNDED')) {
    // A payment page it was still waiting on when it was cancelled can't be
    // paid from now on (if it was paid, the webhook flags it for a refund).
    if (old.stripePaymentIntentId) await closeCheckout(old);
    const was: ReopenedFrom = {
      status: old.status,
      paidAmount: old.paidAmount.toString(),
      paymentMethod: old.paymentMethod,
      discountCodeId: old.discountCodeId,
      bookedById: old.bookedById,
      stripePaymentIntentId: old.stripePaymentIntentId,
      checkedIn: old.checkedIn,
      checkedInAt: old.checkedInAt?.toISOString() ?? null,
      reminderSent: old.reminderSent,
      confirmedAt: old.confirmedAt?.toISOString() ?? null,
      createdAt: old.createdAt.toISOString(),
    };
    await prisma.booking.update({
      where: { id: old.id },
      data: {
        ...fresh,
        // A new booking in all but its badge number.
        createdAt: opts.holdSince ?? new Date(), // so it holds places for its new payment page
        stripePaymentIntentId: null, paymentMethod: null, bookedById: null,
        checkedIn: false, checkedInAt: null, reminderSent: false, confirmedAt: null,
        reopenedFrom: was as unknown as Prisma.InputJsonValue,
      },
    });
    return old.id;
  }
  const highest = await prisma.booking.aggregate({ where: { eventId: event.id }, _max: { badge: true } });
  const booking = await prisma.booking.create({
    data: { eventId: event.id, memberId: member.id, badge: (highest._max.badge ?? 0) + 1, ...fresh, ...(opts.holdSince ? { createdAt: opts.holdSince } : {}) },
  });
  return booking.id;
}

/** Undo createMemberBooking when the payment page couldn't be opened. */
export async function discardMemberBooking(bookingId: string): Promise<void> {
  await dropUnpaidBooking(bookingId);
}

/**
 * Payment succeeded (or nothing was owed). Confirms the member's booking,
 * creates each friend's account (if they don't have one) and booking, counts
 * the discount code once, and emails everyone.
 *
 * Safe to call twice — Stripe retries webhooks. Only a PENDING booking is
 * confirmed, inside one transaction with the friends, so a retry neither
 * double-counts the code, duplicates friends, nor re-sends emails.
 *
 * Never past the event's limits (Gil, Q1: "no bookings taken if event is
 * full"): a payment made after the booking's 10-minute hold ran out, once
 * someone else has taken the places, isn't confirmed — `full` — and the
 * webhook refunds it. It used to be kept, and the event ran one over. The
 * check is made with the event locked, one confirmation at a time, so two
 * payments for the last place can't both get it.
 *
 * `sessionId` (from the Stripe webhook): only the payment page the booking is
 * currently waiting on confirms it. A payment from an older page of the same
 * booking doesn't, so the webhook can flag it for a refund instead.
 *
 * A booking confirmed before (set back to unpaid by the admin, then marked
 * paid again) isn't emailed again, and its discount code isn't counted twice.
 */
export async function confirmBookingGroup(
  bookingId: string,
  opts: { sessionId?: string } = {},
): Promise<{ confirmed: boolean; notifyFailures: string[]; full?: boolean; friendsAlreadyBooked?: FriendAlreadyBooked[] }> {
  const lead = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { member: true, event: { include: { venue: true } } },
  });
  if (!lead) {
    console.error(`Payment received for booking ${bookingId}, which no longer exists — check Stripe and refund if needed.`);
    return { confirmed: false, notifyFailures: [] };
  }
  if (lead.status !== 'PENDING') return { confirmed: false, notifyFailures: [] };
  if (opts.sessionId && lead.stripePaymentIntentId !== opts.sessionId) return { confirmed: false, notifyFailures: [] };
  const firstTime = !lead.confirmedAt;

  const pending = (Array.isArray(lead.pendingFriends) ? lead.pendingFriends : []) as unknown as PendingFriend[];

  // A friend's own unpaid booking for this event would block theirs (one per
  // member per event): clear it first, outside the transaction because it may
  // need to close a Stripe checkout.
  const friendMembers = pending.length
    ? await prisma.member.findMany({ where: { email: { in: pending.map((f) => f.email) } } })
    : [];
  for (const m of friendMembers) {
    const theirs = await prisma.booking.findUnique({ where: { eventId_memberId: { eventId: lead.eventId, memberId: m.id } } });
    if (theirs?.status === 'PENDING') await releasePendingBooking(theirs);
  }
  // bcrypt is slow on purpose; do it before the transaction's clock starts.
  const hashes = await Promise.all(pending.map(() => bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12)));

  const created = await prisma.$transaction(
    async (tx) => {
      // One confirmation at a time for this event, until this one commits,
      // so the check below can't pass for two payments for one place.
      await tx.$queryRaw`SELECT id FROM \`Event\` WHERE id = ${lead.eventId} FOR UPDATE`;
      // Room for everyone on it: paid places, and places other unpaid bookings
      // still hold, counted as when they booked (prepareMemberBooking): not its
      // own, and not the member again as a friend on someone else's. A friend
      // who has booked themselves since isn't booked again below, so needs no
      // second place.
      // Paid while its own hold still runs: holds made after it don't count
      // (they were made in the moment the places looked free, two people
      // booking the last place at once), so it isn't refunded for them.
      const ownHoldRunning = lead.createdAt >= holdCutoff();
      const taken = await placesTaken(lead.eventId, {
        db: tx, excludeBookingId: lead.id, excludeEmail: lead.member.email, ...(ownHoldRunning ? { heldBefore: lead.createdAt } : {}),
      });
      const bookedAlready = pending.length
        ? await tx.booking.findMany({
            where: { eventId: lead.eventId, status: 'CONFIRMED', member: { email: { in: pending.map((f) => f.email) } } },
            select: { member: { select: { email: true } } },
          })
        : [];
      const booked = new Set(bookedAlready.map((x) => x.member.email.toLowerCase()));
      const coming = pending.filter((f) => !booked.has(f.email.toLowerCase()));
      if (capacityProblem(taken, lead.event, countHeld([{ member: lead.member, pendingFriends: coming as unknown as Prisma.JsonValue }]))) return 'full' as const;

      // Never for an event that has been cancelled: a payment completing
      // as Gil cancelled it is refunded instead (the Stripe webhook).
      const flipped = await tx.booking.updateMany({
        where: { id: lead.id, status: 'PENDING', event: { status: { not: 'CANCELLED' } }, ...(opts.sessionId ? { stripePaymentIntentId: opts.sessionId } : {}) },
        data: { status: 'CONFIRMED', pendingFriends: Prisma.DbNull, reopenedFrom: Prisma.DbNull, confirmedAt: lead.confirmedAt ?? new Date() },
      });
      if (flipped.count === 0) return null; // another delivery of this webhook got here first, or the event was cancelled

      const highest = await tx.booking.aggregate({ where: { eventId: lead.eventId }, _max: { badge: true } });
      let badge = (highest._max.badge ?? 0) + 1;
      const friendBookingIds: string[] = [];
      // Friends booked already (by themselves, since): their places weren't used.
      const alreadyBooked: FriendAlreadyBooked[] = [];

      for (const [i, f] of pending.entries()) {
        let friend = await tx.member.findUnique({ where: { email: f.email } });
        if (!friend) {
          friend = await tx.member.create({
            data: {
              name: f.name, email: f.email, mobile: f.mobile, gender: f.gender,
              dateOfBirth: parseDateOfBirth(f.dateOfBirth) ?? new Date(f.dateOfBirth),
              cityId: lead.event.cityId, passwordHash: hashes[i],
              // They never signed up: nothing verified, no T&Cs, no marketing.
              emailVerified: false, mobileVerified: false, agreedTerms: false, marketingOptIn: false,
              awaitingPasswordSetup: true,
            },
          });
        }
        const theirs = await tx.booking.findUnique({ where: { eventId_memberId: { eventId: lead.eventId, memberId: friend.id } } });
        if (theirs && theirs.status !== 'PENDING') {
          alreadyBooked.push({ name: f.name, email: f.email, amount: Number(f.paidAmount ?? 0) });
          continue;
        }
        if (theirs) await tx.booking.delete({ where: { id: theirs.id } });
        const fb = await tx.booking.create({
          data: { eventId: lead.eventId, memberId: friend.id, badge: badge++, status: 'CONFIRMED', paidAmount: f.paidAmount, bookedById: lead.id },
        });
        friendBookingIds.push(fb.id);
      }

      if (lead.discountCodeId && firstTime) {
        await tx.discountCode.update({ where: { id: lead.discountCodeId }, data: { usedCount: { increment: 1 } } });
      }
      return { friendBookingIds, alreadyBooked };
    },
    { timeout: 20_000 },
  );
  if (created === null) return { confirmed: false, notifyFailures: [] };
  if (created === 'full') return { confirmed: false, notifyFailures: [], full: true };

  const confirmedMen = await prisma.booking.count({ where: { eventId: lead.eventId, status: 'CONFIRMED', member: { gender: 'MALE' } } });
  const confirmedWomen = await prisma.booking.count({ where: { eventId: lead.eventId, status: 'CONFIRMED', member: { gender: 'FEMALE' } } });
  if (confirmedMen > lead.event.maxMen || confirmedWomen > lead.event.maxWomen) {
    console.error(`Event ${lead.eventId} is now over capacity (${confirmedMen}/${lead.event.maxMen} men, ${confirmedWomen}/${lead.event.maxWomen} women) after payment for booking ${lead.id}.`);
  }

  const notifyFailures: string[] = [];
  const attempt = async (id: string, send: () => Promise<void>) => {
    try { await send(); } catch (err) { console.error(`Booking ${id}: confirmation email failed`, err); notifyFailures.push(id); }
  };
  if (firstTime) await attempt(lead.id, () => sendBookingConfirmation(lead.id));
  for (const id of created.friendBookingIds) await attempt(id, () => notifyFriend(id, lead.member.name));
  // Paid online for friends who were booked already: their shares go back.
  // (Confirmed by the admin instead, the caller deals with it.)
  if (opts.sessionId) await refundFriendsAlreadyBooked(lead.id, opts.sessionId, created.alreadyBooked);
  // Places just taken: payment pages whose hold ran out, and that no longer
  // fit, are closed.
  await closeLapsedCheckouts(lead.eventId);
  return { confirmed: true, notifyFailures, friendsAlreadyBooked: created.alreadyBooked };
}

/**
 * A friend with no password yet gets the "you've been added to FastMatch —
 * set your password" email, which includes their booking. A friend who
 * already has a working account gets the normal booking confirmation.
 */
async function notifyFriend(bookingId: string, bookedByName: string): Promise<void> {
  const b = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { member: { include: { city: true } }, event: { include: { venue: true, city: true, theme: true } } },
  });
  if (!b.member.awaitingPasswordSetup) return sendBookingConfirmation(bookingId);

  const setPasswordUrl = `${process.env.APP_URL}/set-password?token=${setPasswordToken(b.member)}`;
  const { subject, html } = friendWelcomeEmail({
    friendName: b.member.name,
    bookedByName,
    eventName: eventLabel(b.event),
    venue: venueLine(b.event.venue),
    startsAt: b.event.startsAt,
    ...eventTimeFor(b.event.startsAt, b.event.city.name, b.member.city.name),
    setPasswordUrl,
    checkInUrl: `${process.env.APP_URL}/events/${b.eventId}/checkin`,
  });
  await sendEmail({ to: b.member.email, subject, html });
}

/**
 * One-time link for a friend to choose their first password. Long-lived,
 * because it may sit in an inbox until the night; single-use, because
 * /api/auth/set-password only accepts it while awaitingPasswordSetup is true.
 */
export function setPasswordToken(member: { id: string; email: string }): string {
  // Tied to the address it was sent to: a friend's mistyped email, corrected
  // by Gil, mustn't leave a working link in a stranger's inbox.
  return jwt.sign({ memberId: member.id, purpose: 'set_password', email: member.email.toLowerCase() }, process.env.JWT_SECRET as string, { expiresIn: '60d' });
}
