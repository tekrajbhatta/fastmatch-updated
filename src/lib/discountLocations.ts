import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { type Staff } from './staff';

/**
 * A discount code's "Locations" (Gil, Nov): none means every location (Gil's
 * own codes, FMDC10 and affiliates' included, work on franchise events too,
 * his answer 6); otherwise only events in those cities. A franchisee's codes
 * are always limited to their own locations, and theirs are the only codes
 * they see: those limited to their locations, and any limited to one of
 * their events (his answer 10: "everything already in their location").
 */

/** The codes a franchisee manages (every code, for Gil). */
export async function managedCodesWhere(staff: Staff): Promise<Prisma.DiscountCodeWhereInput> {
  if (staff.cityIds === null) return {};
  const mine = staff.cityIds;
  const events = await prisma.event.findMany({ where: { cityId: { in: mine } }, select: { id: true } });
  return {
    affiliateId: null,
    OR: [
      { scopeCities: { some: {}, every: { id: { in: mine } } } },
      { scopeEventId: { in: events.map((e) => e.id) }, scopeCities: { every: { id: { in: mine } } } },
    ],
  };
}

/** Does this franchisee manage this code? (Gil: every code.) */
export async function managesCode(staff: Staff, codeId: string): Promise<boolean> {
  if (staff.cityIds === null) return true;
  return (await prisma.discountCode.count({ where: { id: codeId, ...(await managedCodesWhere(staff)) } })) > 0;
}

/**
 * The locations to save on a code: as chosen, checked. Gil may choose none
 * (every location). A franchisee chooses among theirs, all of them when
 * nothing was sent. Nothing sent for an existing code (`codeId`) keeps its
 * own, except that a franchisee's code always ends up limited to their
 * locations: one of their events' codes that had none gets them all, so it
 * can't become an every-location code by losing its event.
 */
export async function checkCodeLocations(staff: Staff, chosen: string[] | undefined, codeId?: string):
  Promise<{ ok: true; cityIds: string[] | undefined } | { ok: false; error: string }> {
  if (chosen === undefined && codeId) {
    const keep = staff.cityIds === null || (await prisma.city.count({ where: { discountCodes: { some: { id: codeId } } } })) > 0;
    if (keep) return { ok: true, cityIds: undefined };
  }
  const ids = [...new Set(chosen ?? (staff.cityIds ?? []))];
  if (staff.cityIds !== null) {
    if (ids.length === 0) return { ok: false, error: 'Please choose at least one of your locations.' };
    if (!ids.every((id) => staff.cityIds!.includes(id))) return { ok: false, error: 'Please choose from your own locations.' };
  }
  if (ids.length && (await prisma.city.count({ where: { id: { in: ids } } })) !== ids.length) {
    return { ok: false, error: 'Please choose valid locations.' };
  }
  return { ok: true, cityIds: ids };
}

/** "Event": a franchisee may only limit a code to one of their own events. */
export async function codeEventAllowed(staff: Staff, eventId: string | null): Promise<boolean> {
  if (!eventId || staff.cityIds === null) return true;
  return (await prisma.event.count({ where: { id: eventId, cityId: { in: staff.cityIds } } })) > 0;
}
