import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { getSessionMember } from '@/lib/auth';
import { formatPrice } from '@/lib/price';

/** How far back My Match History goes — the old site's "last 6 months". */
const HISTORY_MONTHS = 6;

/**
 * Offered on My Match History to members who haven't been to an event
 * recently — the old site's "$10.00 OFF your first event with FMDC10".
 * Only shown while a discount code with this name exists and is current, so
 * the page can never advertise a code that doesn't work.
 */
const WELCOME_OFFER_CODE = 'FMDC10';

// GET /api/matches — My Match History: every event the member was booked
// into in the last six months, newest first, each with their Date and
// Friend matches (name, badge number, mobile, email — contact details are
// only ever shown for mutual matches, per the T&Cs). `matchesCalculated`
// false means results aren't in yet ("Information not available yet").
export const GET = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const now = new Date();
  const since = new Date(now);
  since.setMonth(since.getMonth() - HISTORY_MONTHS);

  const bookings = await prisma.booking.findMany({
    where: {
      memberId: member.id,
      status: 'CONFIRMED',
      event: { startsAt: { gte: since, lt: now }, status: { not: 'CANCELLED' } },
    },
    include: { event: { include: { venue: true, city: true } } },
    orderBy: { event: { startsAt: 'desc' } },
  });
  const eventIds = bookings.map((b) => b.eventId);

  const matches = eventIds.length
    ? await prisma.match.findMany({
        where: { eventId: { in: eventIds }, OR: [{ memberAId: member.id }, { memberBId: member.id }] },
      })
    : [];
  const otherIds = [...new Set(matches.map((m) => (m.memberAId === member.id ? m.memberBId : m.memberAId)))];
  const [others, theirBookings] = otherIds.length
    ? await Promise.all([
        prisma.member.findMany({ where: { id: { in: otherIds } }, select: { id: true, name: true, email: true, mobile: true } }),
        prisma.booking.findMany({ where: { eventId: { in: eventIds }, memberId: { in: otherIds } }, select: { eventId: true, memberId: true, badge: true } }),
      ])
    : [[], []];
  const person = new Map(others.map((o) => [o.id, o]));
  const badge = new Map(theirBookings.map((b) => [`${b.eventId}:${b.memberId}`, b.badge]));

  const history = bookings.map((b) => {
    const mine = matches.filter((m) => m.eventId === b.eventId);
    const withDetails = (result: 'DATE' | 'FRIEND') =>
      mine
        .filter((m) => m.result === result)
        .map((m) => {
          const otherId = m.memberAId === member.id ? m.memberBId : m.memberAId;
          const p = person.get(otherId);
          return p ? { ...p, badge: badge.get(`${b.eventId}:${otherId}`) ?? null } : null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
    return {
      event: {
        id: b.event.id, name: b.event.name, startsAt: b.event.startsAt,
        venue: { name: b.event.venue.name, address: b.event.venue.address }, city: { name: b.event.city.name },
      },
      matchesCalculated: b.event.matchesCalculated,
      dateMatches: withDetails('DATE'),
      friendMatches: withDetails('FRIEND'),
    };
  });

  let welcomeOffer: { code: string; description: string } | null = null;
  if (history.length === 0) {
    const d = await prisma.discountCode.findUnique({ where: { code: WELCOME_OFFER_CODE } });
    if (d && d.validFrom <= now && d.validTo >= now) {
      const amount = Number(d.amount ?? 0);
      const description =
        d.type === 'FIXED_REDUCTION' ? `${formatPrice(amount)} OFF` : d.type === 'PERCENT_OFF' ? `${amount}% OFF` : 'a FREE place at';
      welcomeOffer = { code: d.code, description };
    }
  }

  return NextResponse.json({ months: HISTORY_MONTHS, history, welcomeOffer });
});
