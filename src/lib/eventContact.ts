import { prisma } from './prisma';
import { FASTMATCH_CONTACT_EMAIL } from './contactEmail';

/**
 * The address member emails about this event give to write to (Gil's answer
 * 11, 15 Nov): the franchisee's, when the event is in their location and
 * falls within their agreement; otherwise Gil's. Each location has one
 * franchisee at a time (the Franchises page refuses overlaps), so there's
 * one answer. Refund emails keep Gil's: payments go to FastMatch's Stripe.
 */
export async function eventContactEmail(event: { cityId: string; startsAt: Date }): Promise<string> {
  const franchisee = await prisma.member.findFirst({
    where: {
      isFranchisee: true,
      franchiseCities: { some: { id: event.cityId } },
      franchiseFrom: { lte: event.startsAt },
      franchiseTill: { gte: event.startsAt },
    },
    orderBy: { franchiseFrom: 'desc' },
    select: { email: true },
  });
  return franchisee?.email ?? FASTMATCH_CONTACT_EMAIL;
}
