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
import { releaseAbandonedBooking, closeCheckout, dropUnpaidBooking, closeLapsedCheckouts, type ReopenedFrom } from './pendingBooking';
import { sendBookingConfirmation } from './sendBookingConfirmation';
import { refundFriendsNotAdded, type FriendNotAdded } from './friendShareRefund';
import { sendEmail } from './emails/send';
import { friendWelcomeEmail } from './emails/friendEmail';
import { eventTimeFor } from './timezone';
import { eventLabel } from './eventLabel';
import { placesTaken, countHeld, capacityProblem, holdCutoff, payableCutoff } from './capacity';
import { alertDiscountReused } from './paymentAlerts';
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
  // mustn't burn someone's code — and so does one on another event's payment
  // page that could still be paid: two pages open at once used to get the
  // discount twice. That used to count only for the page's 10-minute hold,
  // but the page can be paid for 30, so a second page opened after the hold
  // got the discount again and both could be paid. Once that page closes
  // unpaid, Stripe tells us and the booking (and its claim on the code) goes.
  // This event's own earlier attempt doesn't count, as this booking replaces it.
  const alreadyUsed =
    (await prisma.booking.count({
      where: {
        memberId: member.id,
        discountCodeId: discount.id,
        OR: [{ status: 'CONFIRMED' }, { status: 'PENDING', createdAt: { gte: payableCutoff() }, eventId: { not: event.id } }],
      },
    })) > 0;
  return { ok: true, discount, alreadyUsed };
}

export type Prepared =
  | { ok: false; status: number; error: string; fieldErrors?: FriendFieldError[] }
  | { ok: true; quote: PriceQuote; discount: DiscountCode | null; friends: FriendInput[] };

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

  // Only what the member typed is checked here: nothing about anyone who
  // already has an account. A friend who has one is booked on it when the
  // payment comes through, and only then does their own record decide whether
  // they can come (friendCantComeReason, confirmBookingGroup). If they can't,
  // their share is refunded and the member is told they "couldn't be added".
  // Checking their record here, before paying, told anyone who typed an email
  // address whether that person is on FastMatch, their gender and roughly
  // their age (one general message for every reason, as before, still did:
  // the refusal itself said they were a member). This answer is now the same
  // whoever's address it is.
  const fieldErrors = validateFriends(friends, { ageMin: event.ageMin, ageMax: event.ageMax, memberEmail: member.email });
  if (fieldErrors.length > 0) {
    return { ok: false, status: 400, error: 'Please check your friends’ details.', fieldErrors };
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
 *
 * null: another Book press for the same event got there first (or someone
 * else took the next badge number in the same moment). Two presses at once
 * used to both reopen the same booking, each writing its own friends, so the
 * friends of one could end up on the other's (cheaper) payment page.
 */
export async function createMemberBooking(
  member: Pick<Member, 'id'>,
  event: Pick<Event, 'id'>,
  prepared: Extract<Prepared, { ok: true }>,
  opts: { holdSince?: Date } = {},
): Promise<string | null> {
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
    // Only while it's still what was read just now: a second press reopening
    // it at the same moment finds it changed, and stops.
    const reopened = await prisma.booking.updateMany({
      where: { id: old.id, status: old.status },
      data: {
        ...fresh,
        // A new booking in all but its badge number.
        createdAt: opts.holdSince ?? new Date(), // so it holds places for its new payment page
        stripePaymentIntentId: null, paymentMethod: null, bookedById: null,
        checkedIn: false, checkedInAt: null, reminderSent: false, confirmedAt: null,
        reopenedFrom: was as unknown as Prisma.InputJsonValue,
      },
    });
    return reopened.count === 1 ? old.id : null;
  }
  const highest = await prisma.booking.aggregate({ where: { eventId: event.id }, _max: { badge: true } });
  try {
    const booking = await prisma.booking.create({
      data: { eventId: event.id, memberId: member.id, badge: (highest._max.badge ?? 0) + 1, ...fresh, ...(opts.holdSince ? { createdAt: opts.holdSince } : {}) },
    });
    return booking.id;
  } catch (err) {
    // This member's booking for the event was made by another press a moment
    // ago, or the badge number was just taken: it used to be "Something went wrong".
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
    throw err;
  }
}

/** Amounts in a booking's own records, in cents: the member's place and each friend's. */
const toCents = (value: unknown) => Math.round(Number(value ?? 0) * 100);

/**
 * What an unpaid booking is for, in cents: the member's place plus each
 * friend's on it. Its payment page was opened for exactly this, so a payment
 * of any other amount, or in another currency, doesn't confirm it.
 */
export function bookingTotalCents(b: { paidAmount: unknown; pendingFriends: Prisma.JsonValue | null }): number {
  const friends = Array.isArray(b.pendingFriends) ? b.pendingFriends : [];
  let total = toCents(b.paidAmount);
  for (const f of friends) {
    if (f && typeof f === 'object' && !Array.isArray(f)) total += toCents((f as Record<string, unknown>).paidAmount);
  }
  return total;
}

/** Who the friends on a booking are, in any order (the database may reorder what's stored). */
function friendsKey(friends: unknown): string {
  const list = Array.isArray(friends) ? friends : [];
  return list
    .map((f) => (f && typeof f === 'object' && typeof (f as Record<string, unknown>).email === 'string' ? ((f as Record<string, unknown>).email as string).trim().toLowerCase() : ''))
    .sort()
    .join('|');
}

/**
 * Is this unpaid booking still exactly the one this Book press priced: no
 * payment page yet, the same discount code, the same friends, the same total?
 */
export function isSameAttempt(
  row: { status: string; stripePaymentIntentId: string | null; discountCodeId: string | null; paidAmount: unknown; pendingFriends: Prisma.JsonValue | null },
  prepared: Extract<Prepared, { ok: true }>,
): boolean {
  return (
    row.status === 'PENDING' &&
    !row.stripePaymentIntentId &&
    (row.discountCodeId ?? null) === (prepared.discount?.id ?? null) &&
    bookingTotalCents(row) === Math.round(prepared.quote.total * 100) &&
    friendsKey(row.pendingFriends) === friendsKey(prepared.friends)
  );
}

/**
 * Records the payment page just opened for this booking, only if the booking
 * still holds what that page charges for. Otherwise (another Book press
 * changed it in the meantime) false, and the caller closes the page. The
 * page used to be recorded whatever the booking held by then, so the friends
 * of one press could be confirmed by paying the other press's cheaper page.
 */
export async function attachCheckout(bookingId: string, sessionId: string, prepared: Extract<Prepared, { ok: true }>): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM \`Booking\` WHERE id = ${bookingId} FOR UPDATE`;
    const row = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!row || !isSameAttempt(row, prepared)) return false;
    await tx.booking.update({ where: { id: bookingId }, data: { stripePaymentIntentId: sessionId } });
    return true;
  });
}

/** Undo createMemberBooking when the payment page couldn't be opened. */
export async function discardMemberBooking(bookingId: string): Promise<void> {
  await dropUnpaidBooking(bookingId);
}

/**
 * Why a friend who already has an account can't be booked on it, or null if
 * they can. Their own record decides, not what the member typed: booked
 * already, a cancelled or refunded booking for the event (Gil rebooks those),
 * their own booking waiting for payment, registered as the other gender, or
 * outside the ages by their date of birth on file.
 *
 * Asked only once the booking is paid for (confirmBookingGroup), never
 * before: asked at the booking form, it told anyone who typed an email
 * address whether that person is on FastMatch, their gender and roughly
 * their age. The reason is for Gil's email only; the member who brought them
 * is told just that they "couldn't be added" (src/lib/friendShareRefund.ts).
 */
export function friendCantComeReason(
  account: { gender: string; dateOfBirth: Date },
  theirBooking: { status: string } | null | undefined,
  typed: { gender: string },
  event: { ageMin: number; ageMax: number },
  now: Date = new Date(),
): string | null {
  if (theirBooking?.status === 'CONFIRMED') return 'they were already booked into this event';
  if (theirBooking?.status === 'CANCELLED' || theirBooking?.status === 'REFUNDED') {
    return 'they have a cancelled or refunded booking for this event (book them in yourself if they are coming)';
  }
  if (theirBooking) return 'they have their own booking for this event, waiting for its payment';
  if (account.gender !== typed.gender) return `they're registered as ${genderWord(account.gender)}, but were booked as ${genderWord(typed.gender)}`;
  const age = calculateAge(account.dateOfBirth, now);
  if (age < event.ageMin || age > event.ageMax) {
    return `their date of birth on file makes them ${age}, outside this event's ages (${event.ageMin} to ${event.ageMax})`;
  }
  return null;
}

const genderWord = (g: string) => (g === 'MALE' ? 'male' : 'female');

/** A friend's address as stored on a booking, for comparing ("Tom@Example.com " is tom@example.com). */
const emailKey = (email: string) => email.trim().toLowerCase();

/**
 * Payment succeeded (or nothing was owed). Confirms the member's booking,
 * creates each friend's account (if they don't have one) and booking, counts
 * the discount code once, and emails everyone.
 *
 * A friend who already has an account and can't come (friendCantComeReason)
 * isn't booked and takes no place: paid online, their share is refunded and
 * the member told (refundFriendsNotAdded); otherwise the caller deals with
 * them (`friendsNotAdded`).
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
 *
 * `expectTotalCents`: what was actually paid (the Stripe webhook), or 0 for a
 * booking with nothing to pay. Confirmed only if the booking is still for
 * exactly that much, checked with the booking locked: otherwise
 * `amountMismatch`, and nothing changes. Two Book presses at once could leave
 * one press's friends on the other's cheaper payment page, or on a free
 * booking, and paying that page booked them all.
 *
 * A once-per-member discount code this member has already used on another
 * paid booking (two pages paid at the same moment, say) still confirms the
 * place, which was paid for, and Gil is emailed (`discountReused`) to decide
 * whether to ask for the difference.
 */
export async function confirmBookingGroup(
  bookingId: string,
  opts: { sessionId?: string; expectTotalCents?: number } = {},
): Promise<{
  confirmed: boolean; notifyFailures: string[]; full?: boolean; amountMismatch?: boolean; discountReused?: boolean;
  friendsNotAdded?: FriendNotAdded[];
  /** The same list, by its old name: src/lib/adminBooking.ts reads it. */
  friendsAlreadyBooked?: FriendNotAdded[];
}> {
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
  // member per event): cleared first if it's abandoned, outside the
  // transaction because Stripe is asked. One whose payment page could still
  // be paid is theirs, and left alone: they aren't added to this booking. It
  // used to be closed, by someone else's booking, while they might be paying.
  const friendMembers = pending.length
    ? await prisma.member.findMany({ where: { email: { in: pending.map((f) => f.email) } } })
    : [];
  for (const m of friendMembers) {
    const theirs = await prisma.booking.findUnique({ where: { eventId_memberId: { eventId: lead.eventId, memberId: m.id } } });
    if (theirs?.status === 'PENDING') await releaseAbandonedBooking(theirs);
  }
  // bcrypt is slow on purpose; do it before the transaction's clock starts.
  const hashes = await Promise.all(pending.map(() => bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12)));

  const created = await prisma.$transaction(
    async (tx) => {
      // One confirmation at a time for this event, until this one commits,
      // so the check below can't pass for two payments for one place.
      await tx.$queryRaw`SELECT id FROM \`Event\` WHERE id = ${lead.eventId} FOR UPDATE`;
      // And this booking, so another Book press can't change what's on it
      // between this check and the confirmation (attachCheckout and the
      // reopen in createMemberBooking wait for it, then find it confirmed).
      await tx.$queryRaw`SELECT id FROM \`Booking\` WHERE id = ${lead.id} FOR UPDATE`;
      const current = await tx.booking.findUnique({ where: { id: lead.id } });
      if (!current || current.status !== 'PENDING') return null;
      if (opts.sessionId && current.stripePaymentIntentId !== opts.sessionId) return null;
      // Still the friends and amounts read above (they're who gets booked below),
      // and still what was paid.
      const owed = bookingTotalCents(current);
      if (owed !== bookingTotalCents(lead) || friendsKey(current.pendingFriends) !== friendsKey(lead.pendingFriends)) return 'mismatch' as const;
      if (opts.expectTotalCents !== undefined && owed !== opts.expectTotalCents) return 'mismatch' as const;

      // Friends who already have an account: now that it's paid for, their own
      // record decides whether they can come (never before payment: see
      // prepareMemberBooking). Those who can't aren't booked below, and need
      // no place.
      const accounts = pending.length ? await tx.member.findMany({ where: { email: { in: pending.map((f) => f.email) } } }) : [];
      const theirBookings = accounts.length
        ? await tx.booking.findMany({ where: { eventId: lead.eventId, memberId: { in: accounts.map((m) => m.id) } }, select: { memberId: true, status: true } })
        : [];
      const cantCome = new Map<string, string>();
      for (const f of pending) {
        const account = accounts.find((m) => emailKey(m.email) === emailKey(f.email));
        if (!account) continue;
        const why = friendCantComeReason(account, theirBookings.find((b) => b.memberId === account.id), f, lead.event);
        if (why) cantCome.set(emailKey(f.email), why);
      }

      // Room for everyone on it: paid places, and places other unpaid bookings
      // still hold, counted as when they booked (prepareMemberBooking): not its
      // own, and not the member again as a friend on someone else's. A friend
      // who can't come (booked themselves since, say) isn't booked below, so
      // needs no place.
      // Paid while its own hold still runs: holds made after it don't count
      // (they were made in the moment the places looked free, two people
      // booking the last place at once), so it isn't refunded for them.
      const ownHoldRunning = lead.createdAt >= holdCutoff();
      const taken = await placesTaken(lead.eventId, {
        db: tx, excludeBookingId: lead.id, excludeEmail: lead.member.email, ...(ownHoldRunning ? { heldBefore: lead.createdAt } : {}),
      });
      const coming = pending.filter((f) => !cantCome.has(emailKey(f.email)));
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
      // Friends who couldn't be added: their places weren't used.
      const notAdded: FriendNotAdded[] = [];

      for (const [i, f] of pending.entries()) {
        const why = cantCome.get(emailKey(f.email));
        if (why) {
          notAdded.push({ name: f.name, email: f.email, amount: Number(f.paidAmount ?? 0), reason: why });
          continue;
        }
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
        // Never someone's own booking replaced: one there now (made since the
        // check above) means they're not added either.
        const theirs = await tx.booking.findUnique({ where: { eventId_memberId: { eventId: lead.eventId, memberId: friend.id } } });
        if (theirs) {
          notAdded.push({ name: f.name, email: f.email, amount: Number(f.paidAmount ?? 0), reason: 'they had their own booking for this event by the time the payment came through' });
          continue;
        }
        const fb = await tx.booking.create({
          data: { eventId: lead.eventId, memberId: friend.id, badge: badge++, status: 'CONFIRMED', paidAmount: f.paidAmount, bookedById: lead.id },
        });
        friendBookingIds.push(fb.id);
      }

      let discountReused = false;
      if (lead.discountCodeId && firstTime) {
        // One member's confirmations one at a time (they may be for different
        // events, so the event lock doesn't cover it), then: is this code
        // already on another of their paid bookings?
        await tx.$queryRaw`SELECT id FROM \`Member\` WHERE id = ${lead.memberId} FOR UPDATE`;
        discountReused = (await tx.booking.count({
          where: { memberId: lead.memberId, discountCodeId: lead.discountCodeId, status: 'CONFIRMED', id: { not: lead.id } },
        })) > 0;
        await tx.discountCode.update({ where: { id: lead.discountCodeId }, data: { usedCount: { increment: 1 } } });
      }
      return { friendBookingIds, notAdded, discountReused };
    },
    { timeout: 20_000 },
  );
  if (created === null) return { confirmed: false, notifyFailures: [] };
  if (created === 'full') return { confirmed: false, notifyFailures: [], full: true };
  if (created === 'mismatch') {
    console.error(`Booking ${lead.id}: not confirmed — it no longer matches what was paid (${opts.expectTotalCents ?? 'unknown'} cents).`);
    return { confirmed: false, notifyFailures: [], amountMismatch: true };
  }
  if (created.discountReused) await tellGilDiscountReused(lead);

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
  // Paid online for friends who couldn't be added: their shares go back, and
  // the member is told (in the same words whatever the reason). Confirmed by
  // the admin, or with nothing to pay, the caller deals with them.
  if (opts.sessionId) await refundFriendsNotAdded(lead.id, opts.sessionId, created.notAdded);
  // Places just taken: payment pages whose hold ran out, and that no longer
  // fit, are closed.
  await closeLapsedCheckouts(lead.eventId);
  return { confirmed: true, notifyFailures, discountReused: created.discountReused, friendsNotAdded: created.notAdded, friendsAlreadyBooked: created.notAdded };
}

/**
 * Gil is told about a once-per-member code used a second time. The place is
 * booked (it was paid for); whether to ask for the difference is his call.
 * Never throws.
 */
async function tellGilDiscountReused(lead: {
  id: string; stripePaymentIntentId: string | null; paidAmount: unknown; discountCodeId: string | null;
  member: Pick<Member, 'name' | 'email'>; event: Event;
}): Promise<void> {
  try {
    const code = lead.discountCodeId ? await prisma.discountCode.findUnique({ where: { id: lead.discountCodeId }, select: { code: true } }) : null;
    const theme = await prisma.eventTheme.findUnique({ where: { id: lead.event.themeId }, select: { name: true } });
    const extra = Math.max(0, Number(lead.event.cost) - Number(lead.paidAmount));
    await alertDiscountReused({
      sessionId: lead.stripePaymentIntentId,
      bookingId: lead.id,
      memberName: lead.member.name,
      memberEmail: lead.member.email,
      eventName: eventLabel({ name: lead.event.name, theme: { name: theme?.name ?? '' } }),
      code: code?.code ?? '',
      discountGiven: extra,
    });
  } catch (err) {
    console.error(`Booking ${lead.id}: couldn't tell Gil about a discount code used twice`, err);
  }
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
    ...eventTimeFor(b.event.startsAt, b.event.city.name, b.member.city?.name),
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
  return jwt.sign({ memberId: member.id, purpose: 'set_password', email: member.email.toLowerCase() }, process.env.JWT_SECRET as string, { expiresIn: '60d', algorithm: 'HS256' });
}
