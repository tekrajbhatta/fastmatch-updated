import { cache } from 'react';
import { NextResponse, type NextRequest } from 'next/server';
import type { Member, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { getCurrentMember, getSessionMember } from './auth';
import { discountDay } from './discountDates';

/**
 * Who may use the admin, and how much of it (Gil, Nov): Gil (an admin) sees
 * everything; a franchisee (src/lib/franchise.ts) sees Events, Members
 * (search), Venues, Discount codes and Reports, for their own locations only.
 * Everything else (Blasts, Affiliates, Event Types, Member Feedback,
 * Franchises, editing members, matches) stays Gil's, behind requireAdmin.
 *
 * Every staff API route starts with requireStaff and then keeps to
 * `cityIds`: a list asks only for those cities (eventScope), and one thing
 * asked for by id that's outside them answers "not found" (canSeeCity), as
 * if it didn't exist.
 */
export interface Staff {
  member: Member;
  isAdmin: boolean;
  /** null: every location (Gil). A franchisee: their locations. */
  cityIds: string[] | null;
  /** A franchisee's agreement (their reports only cover it); null for Gil. */
  agreement: { from: Date; till: Date } | null;
}

async function staffFor(member: Member | null): Promise<Staff | null> {
  if (!member) return null;
  if (member.isAdmin) return { member, isAdmin: true, cityIds: null, agreement: null };
  // The session already refused a franchisee outside their agreement (src/lib/auth.ts).
  if (!member.isFranchisee || !member.franchiseFrom || !member.franchiseTill) return null;
  const cities = await prisma.city.findMany({ where: { franchisees: { some: { id: member.id } } }, select: { id: true } });
  return { member, isAdmin: false, cityIds: cities.map((c) => c.id), agreement: { from: member.franchiseFrom, till: member.franchiseTill } };
}

/** Gil or a franchisee, for an API route; null for anyone else. */
export async function requireStaff(req: NextRequest): Promise<Staff | null> {
  return staffFor(await getSessionMember(req));
}

/** The same for a server page or layout, once per request. */
export const getCurrentStaff = cache(async (): Promise<Staff | null> => staffFor(await getCurrentMember()));

/** May they see things in this city? */
export function canSeeCity(staff: Staff, cityId: string | null | undefined): boolean {
  return staff.cityIds === null || (!!cityId && staff.cityIds.includes(cityId));
}

/** Are all these cities theirs? (Empty means every location: Gil's alone.) */
export function ownsCities(staff: Staff, cityIds: string[]): boolean {
  return staff.cityIds === null || (cityIds.length > 0 && cityIds.every((id) => staff.cityIds!.includes(id)));
}

/** Events (or anything with a cityId) they may see. */
export function cityScope(staff: Staff): { cityId?: { in: string[] } } {
  return staff.cityIds === null ? {} : { cityId: { in: staff.cityIds } };
}

export function eventScope(staff: Staff): Prisma.EventWhereInput {
  return cityScope(staff);
}

/** Their reports' dates, "YYYY-MM-DD" in Sydney: within the agreement for a franchisee. */
export function reportDates(staff: Staff, asked: { dateFrom?: string; dateTo?: string }): { dateFrom?: string; dateTo?: string } {
  if (!staff.agreement) return asked;
  const first = discountDay(staff.agreement.from);
  const last = discountDay(staff.agreement.till);
  return {
    dateFrom: asked.dateFrom && asked.dateFrom > first ? asked.dateFrom : first,
    dateTo: asked.dateTo && asked.dateTo < last ? asked.dateTo : last,
  };
}

/**
 * A report's filters for them (Gil's answer 7): a franchisee's cover only
 * their locations and their agreement's dates. `cityIds` goes to the report's
 * loader; a city outside theirs leaves nothing to report.
 */
export function scopeReportFilters<T extends { cityId?: string; dateFrom?: string; dateTo?: string }>(staff: Staff, q: T): { q: T; cityIds: string[] | null } {
  if (staff.cityIds === null) return { q, cityIds: null };
  return { q: { ...q, ...reportDates(staff, q) }, cityIds: q.cityId && !staff.cityIds.includes(q.cityId) ? [] : staff.cityIds };
}

/** Is this moment within a franchisee's agreement (always, for Gil)? For one event's report. */
export function inAgreement(staff: Staff, at: Date): boolean {
  return !staff.agreement || (at >= staff.agreement.from && at <= staff.agreement.till);
}

export const notAuthorized = () => NextResponse.json({ error: 'Not authorized' }, { status: 403 });
/** Outside their locations: as if it didn't exist. */
export const notFound = (what = 'Not found') => NextResponse.json({ error: what }, { status: 404 });

/**
 * An event's city and venue, for a franchisee: both in their locations. The
 * problem against its form field, or null (always null for Gil).
 */
export async function eventPlaceProblem(staff: Staff, cityId: string, venueId: string): Promise<Record<string, string> | null> {
  if (staff.cityIds === null) return null;
  if (!canSeeCity(staff, cityId)) return { cityId: 'Please choose one of your locations.' };
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { cityId: true } });
  if (!venue || !canSeeCity(staff, venue.cityId)) return { venueId: 'Please choose a venue in your locations.' };
  return null;
}

/** May they see this event? (Gil: always, without a look-up.) An unknown event: no. */
export async function eventInScope(staff: Staff, eventId: string): Promise<boolean> {
  if (staff.cityIds === null) return true;
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { cityId: true } });
  return !!event && canSeeCity(staff, event.cityId);
}
