import { EVENT_TIME_ZONE } from './datetime';
import { dateIn, startOfDayIn, addDays } from './zonedTime';

/*
 * A discount code's "Valid from" and "Valid to" are whole days in Sydney: it
 * works from 12:00 am on the first day to 11:59:59 pm on the last. They used
 * to be stored as midnight UTC (10–11 am in Sydney), so a code stopped
 * working on the morning of its last advertised day. (Existing codes were
 * moved over by the 20261007120000_discount_days_sydney migration.)
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The moments a code starts and stops working, from the two days chosen
 * ("YYYY-MM-DD"). Null unless both are real dates.
 */
export function discountValidity(from: string, to: string): { validFrom: Date; validTo: Date } | null {
  if (!DAY.test(from) || !DAY.test(to)) return null;
  const validFrom = startOfDayIn(from, EVENT_TIME_ZONE);
  const lastDay = startOfDayIn(to, EVENT_TIME_ZONE);
  if (Number.isNaN(validFrom.getTime()) || Number.isNaN(lastDay.getTime())) return null;
  return { validFrom, validTo: new Date(startOfDayIn(addDays(to, 1), EVENT_TIME_ZONE).getTime() - 1) };
}

/** The Sydney day a stored validFrom / validTo falls on: "2026-10-09", for the date inputs. */
export function discountDay(at: string | Date): string {
  return dateIn(at, EVENT_TIME_ZONE);
}

/** "9/10/2026": a stored validFrom / validTo as its Sydney day. */
export function formatDiscountDay(at: string | Date): string {
  return new Date(at).toLocaleDateString('en-AU', { timeZone: EVENT_TIME_ZONE });
}

/**
 * Where a code stands today, for the Discount codes list: it used to say
 * "Active" for a code whose first day hadn't come yet.
 */
export function discountStatus(c: { validFrom: string | Date; validTo: string | Date }, now: Date = new Date()): 'active' | 'not-started' | 'expired' {
  if (new Date(c.validTo) < now) return 'expired';
  if (new Date(c.validFrom) > now) return 'not-started';
  return 'active';
}
