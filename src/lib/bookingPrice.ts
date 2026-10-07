/**
 * What a member pays to book an event, optionally bringing friends — the
 * "Booking details" summary on the event page and the amount sent to Stripe.
 * One pure function, so the summary the member reads and the amount they're
 * charged can never disagree.
 *
 * Gil's rules:
 *   - The member pays for themselves and every friend they bring, at the
 *     event's ticket price each.
 *   - Each friend takes GROUP_DISCOUNT_PER_FRIEND off the total.
 *   - A discount code takes its discount on top — on the member's OWN ticket
 *     (a code is personal: one use per member).
 *   - A code this member has already used still books, but at no discount,
 *     and the summary says so ("DEMO10 promotion already used").
 */

export const GROUP_DISCOUNT_PER_FRIEND = 10;
export const MAX_FRIENDS_PER_GENDER = 5;

export type CouponType = 'PERCENT_OFF' | 'FIXED_REDUCTION' | 'FREE';

export interface PriceInput {
  cost: number;
  memberName: string;
  friends: { name: string; gender: 'MALE' | 'FEMALE' }[];
  /** A code that is valid for this event, or null for none. */
  coupon: { code: string; type: CouponType; amount: number | null } | null;
  /** Valid, but this member has already used it: on a confirmed booking, or on another event's payment page right now. */
  couponAlreadyUsed: boolean;
}

/** amount null = an information line with no figure. */
export interface PriceLine { label: string; amount: number | null }

export interface PriceQuote {
  lines: PriceLine[];
  total: number;
  /** GST component of a GST-inclusive total (1/11th). */
  gstIncluded: number;
  couponApplied: boolean;
  /** Stored on each booking so revenue reports add up to what was charged. */
  memberAmount: number;
  friendAmount: number;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function priceBooking(input: PriceInput): PriceQuote {
  const { cost, friends, coupon } = input;
  const couponApplied = !!coupon && !input.couponAlreadyUsed;

  // Same arithmetic the booking route has always used for codes, so existing
  // codes behave exactly as before for a member booking alone.
  let couponDiscount = 0;
  if (couponApplied) {
    if (coupon.type === 'PERCENT_OFF') couponDiscount = cents((cost * (coupon.amount ?? 0)) / 100);
    if (coupon.type === 'FIXED_REDUCTION') couponDiscount = Math.min(cost, coupon.amount ?? 0);
    if (coupon.type === 'FREE') couponDiscount = cost;
  }
  const memberAmount = cents(cost - couponDiscount);

  // The group discount is booked against each friend's ticket, never the
  // member's — so a free-code member bringing friends can't end up with a
  // negative booking. Floored at zero for (unlikely) events under $10.
  const friendAmount = cents(Math.max(0, cost - GROUP_DISCOUNT_PER_FRIEND));
  const groupDiscount = cents(friends.length * (cost - friendAmount));
  const total = cents(memberAmount + friendAmount * friends.length);

  const lines: PriceLine[] = [{ label: input.memberName, amount: cents(cost) }];
  const count = { MALE: 0, FEMALE: 0 };
  for (const f of friends) {
    count[f.gender]++;
    lines.push({ label: `${f.gender === 'MALE' ? 'Male' : 'Female'} friend ${count[f.gender]} – ${f.name || '…'}`, amount: cents(cost) });
  }
  if (friends.length > 0) lines.push({ label: 'Group booking discount', amount: -groupDiscount });
  if (coupon && couponApplied) lines.push({ label: `Discount code ${coupon.code}`, amount: -couponDiscount });
  if (coupon && !couponApplied) lines.push({ label: `${coupon.code} promotion already used`, amount: null });

  return { lines, total, gstIncluded: cents(total / 11), couponApplied, memberAmount, friendAmount };
}
