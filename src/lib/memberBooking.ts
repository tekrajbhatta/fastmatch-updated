import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { DiscountCode, Event, Member } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { calculateAge } from './age';
import { venueLine } from './venue';
import { priceBooking, MAX_FRIENDS_PER_GENDER, type PriceQuote } from './bookingPrice';
import { validateFriends, parseDateOfBirth, type FriendInput, type FriendFieldError } from './friendBooking';
import { releasePendingBooking } from './pendingBooking';
import { sendBookingConfirmation } from './sendBookingConfirmation';
import { sendEmail } from './emails/send';
import { friendWelcomeEmail } from './emails/friendEmail';
import { eventTimeFor } from './timezone';

/**
 * A member booking themselves — and, where the event allows it, friends —
 * online. Shared by /api/events/:id/book and the Stripe webhook.
 *
 * Lifecycle (Gil: "until the payment is done keep the booking pending so
 * that other members can book it"):
 *   1. book    — the member's booking is created PENDING. Friends are only
 *                recorded on it (pendingFriends). Nothing holds a place.
 *   2. payment — confirmBookingGroup() confirms the member, creates each
 *                friend's account (if new) and booking, and emails everyone.
 *   Abandoned  — nothing happens; the unpaid booking sits there harmlessly
 *                and is replaced if the member tries again.
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
  event: Pick<Event, 'themeId' | 'fastmatchDiscounts'>,
  rawCode: string,
): Promise<{ ok: false; error: string } | { ok: true; discount: DiscountCode; alreadyUsed: boolean }> {
  if (!event.fastmatchDiscounts) return { ok: false, error: "Discount codes can't be used for this event." };
  const discount = await prisma.discountCode.findUnique({ where: { code: rawCode.trim() } });
  const now = new Date();
  const valid =
    discount &&
    discount.validFrom <= now &&
    discount.validTo >= now &&
    (!discount.scopeThemeId || discount.scopeThemeId === event.themeId);
  if (!discount || !valid) return { ok: false, error: 'This discount code is not valid for this event.' };
  // One use per member. Only a CONFIRMED booking counts — an abandoned
  // checkout mustn't burn someone's code.
  const alreadyUsed =
    (await prisma.booking.count({ where: { memberId: member.id, discountCodeId: discount.id, status: 'CONFIRMED' } })) > 0;
  return { ok: true, discount, alreadyUsed };
}

export type Prepared =
  | { ok: false; status: number; error: string; fieldErrors?: FriendFieldError[] }
  | { ok: true; quote: PriceQuote; discount: DiscountCode | null; friends: FriendInput[] };

const genderWord = (g: 'MALE' | 'FEMALE') => (g === 'MALE' ? 'male' : 'female');

export async function prepareMemberBooking(
  member: Pick<Member, 'id' | 'name' | 'email' | 'gender'>,
  event: Event,
  input: { discountCode?: string; friends: FriendInput[] },
): Promise<Prepared> {
  if (event.draft || event.visibility !== 'PUBLIC' || event.status !== 'UPCOMING') {
    return { ok: false, status: 400, error: 'This event is not open for booking.' };
  }

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
  // real record — not what was typed — decides whether they can come. Each
  // reason gets its own message (Gil's call).
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
    const message =
      b?.status === 'CONFIRMED'
        ? 'This person is already booked into this event.'
        : b && b.status !== 'PENDING'
          ? "This person's earlier booking for this event was cancelled — please contact gil@fastmatch.com.au to rebook them."
          : m.gender !== f.gender
            ? `This email belongs to a member registered as ${genderWord(m.gender)} — please add them as a ${genderWord(m.gender)} friend.`
            : (() => {
                const age = calculateAge(m.dateOfBirth);
                return age < event.ageMin || age > event.ageMax
                  ? `This member's date of birth on file doesn't fall into this event's age bracket.`
                  : null;
              })();
    if (message) fieldErrors.push({ index, field: 'email', message });
  });

  if (fieldErrors.length > 0) {
    return { ok: false, status: 400, error: 'Please check your friends’ details.', fieldErrors };
  }

  // ---- capacity: paid places only. Unpaid bookings hold nothing.
  const [menBooked, womenBooked] = await Promise.all(
    (['MALE', 'FEMALE'] as const).map((g) =>
      prisma.booking.count({ where: { eventId: event.id, status: 'CONFIRMED', member: { gender: g } } }),
    ),
  );
  const wantMen = men + (member.gender === 'MALE' ? 1 : 0);
  const wantWomen = women + (member.gender === 'FEMALE' ? 1 : 0);
  if (menBooked + wantMen > event.maxMen || womenBooked + wantWomen > event.maxWomen) {
    if (friends.length === 0) return { ok: false, status: 409, error: 'This event is full for your gender.' };
    const short = menBooked + wantMen > event.maxMen ? 'men' : 'women';
    return { ok: false, status: 409, error: `Sorry — there aren't enough places left for ${short} at this event for everyone in your booking.` };
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

/** The member's booking, PENDING, with their friends recorded on it. */
export async function createMemberBooking(
  member: Pick<Member, 'id'>,
  event: Pick<Event, 'id'>,
  prepared: Extract<Prepared, { ok: true }>,
): Promise<string> {
  const pending: PendingFriend[] = prepared.friends.map((f) => ({
    gender: f.gender,
    name: f.name.trim(),
    email: f.email.trim(),
    mobile: f.mobile.trim(),
    dateOfBirth: f.dateOfBirth.trim(),
    paidAmount: prepared.quote.friendAmount,
  }));
  const highest = await prisma.booking.aggregate({ where: { eventId: event.id }, _max: { badge: true } });
  const booking = await prisma.booking.create({
    data: {
      eventId: event.id,
      memberId: member.id,
      badge: (highest._max.badge ?? 0) + 1,
      status: 'PENDING',
      paidAmount: prepared.quote.memberAmount,
      discountCodeId: prepared.discount?.id,
      pendingFriends: pending.length ? (pending as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  });
  return booking.id;
}

/** Undo createMemberBooking when the payment page couldn't be opened. */
export async function discardMemberBooking(bookingId: string): Promise<void> {
  await prisma.booking.deleteMany({ where: { id: bookingId, status: 'PENDING' } });
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
 * Payment has been taken by now, so nobody is turned away here: if the last
 * place went to someone else during checkout, the event runs one over, and
 * the server log says so.
 */
export async function confirmBookingGroup(bookingId: string): Promise<{ confirmed: boolean; notifyFailures: string[] }> {
  const lead = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { member: true, event: { include: { venue: true } } },
  });
  if (!lead) {
    console.error(`Payment received for booking ${bookingId}, which no longer exists — check Stripe and refund if needed.`);
    return { confirmed: false, notifyFailures: [] };
  }
  if (lead.status !== 'PENDING') return { confirmed: false, notifyFailures: [] };

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
      const flipped = await tx.booking.updateMany({ where: { id: lead.id, status: 'PENDING' }, data: { status: 'CONFIRMED', pendingFriends: Prisma.DbNull } });
      if (flipped.count === 0) return null; // another delivery of this webhook got here first

      const highest = await tx.booking.aggregate({ where: { eventId: lead.eventId }, _max: { badge: true } });
      let badge = (highest._max.badge ?? 0) + 1;
      const friendBookingIds: string[] = [];

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
          console.error(`Booking ${lead.id}: ${lead.member.name} paid for friend ${friend.email}, who already has a ${theirs.status} booking — consider a refund of $${f.paidAmount}.`);
          continue;
        }
        if (theirs) await tx.booking.delete({ where: { id: theirs.id } });
        const fb = await tx.booking.create({
          data: { eventId: lead.eventId, memberId: friend.id, badge: badge++, status: 'CONFIRMED', paidAmount: f.paidAmount, bookedById: lead.id },
        });
        friendBookingIds.push(fb.id);
      }

      if (lead.discountCodeId) {
        await tx.discountCode.update({ where: { id: lead.discountCodeId }, data: { usedCount: { increment: 1 } } });
      }
      return friendBookingIds;
    },
    { timeout: 20_000 },
  );
  if (created === null) return { confirmed: false, notifyFailures: [] };

  const confirmedMen = await prisma.booking.count({ where: { eventId: lead.eventId, status: 'CONFIRMED', member: { gender: 'MALE' } } });
  const confirmedWomen = await prisma.booking.count({ where: { eventId: lead.eventId, status: 'CONFIRMED', member: { gender: 'FEMALE' } } });
  if (confirmedMen > lead.event.maxMen || confirmedWomen > lead.event.maxWomen) {
    console.error(`Event ${lead.eventId} is now over capacity (${confirmedMen}/${lead.event.maxMen} men, ${confirmedWomen}/${lead.event.maxWomen} women) after payment for booking ${lead.id}.`);
  }

  const notifyFailures: string[] = [];
  const attempt = async (id: string, send: () => Promise<void>) => {
    try { await send(); } catch (err) { console.error(`Booking ${id}: confirmation email failed`, err); notifyFailures.push(id); }
  };
  await attempt(lead.id, () => sendBookingConfirmation(lead.id));
  for (const id of created) await attempt(id, () => notifyFriend(id, lead.member.name));
  return { confirmed: true, notifyFailures };
}

/**
 * A friend with no password yet gets the "you've been added to FastMatch —
 * set your password" email, which includes their booking. A friend who
 * already has a working account gets the normal booking confirmation.
 */
async function notifyFriend(bookingId: string, bookedByName: string): Promise<void> {
  const b = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { member: { include: { city: true } }, event: { include: { venue: true, city: true } } },
  });
  if (!b.member.awaitingPasswordSetup) return sendBookingConfirmation(bookingId);

  const setPasswordUrl = `${process.env.APP_URL}/set-password?token=${setPasswordToken(b.member.id)}`;
  const { subject, html } = friendWelcomeEmail({
    friendName: b.member.name,
    bookedByName,
    eventName: b.event.name,
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
export function setPasswordToken(memberId: string): string {
  return jwt.sign({ memberId, purpose: 'set_password' }, process.env.JWT_SECRET as string, { expiresIn: '60d' });
}
