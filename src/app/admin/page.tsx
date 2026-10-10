import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { getCurrentMember } from '@/lib/auth';
import { eventLabel } from '@/lib/eventLabel';
import { formatEventWhen, EVENT_TIME_ZONE } from '@/lib/datetime';
import { timeZoneForCity, zoneNote } from '@/lib/timezone';
import { checkInState, endOfEventNight } from '@/lib/eventNight';
import { countOf } from '@/lib/plural';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function AdminDashboard() {
  // The admin layout has already turned away anyone who isn't an admin.
  const member = await getCurrentMember();
  const comingUp = member?.isAdmin ? await comingUpEvents() : [];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Admin dashboard</h1>
      <p className="mb-6 text-sm text-ink/60">Manage events, blasts, members, venues, discounts, event types, and reports.</p>

      {/* At the venue, on a phone: tonight's bookings in one tap, not three. */}
      {comingUp.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-extrabold text-ink">Coming up</h2>
          <p className="mb-3 text-sm text-ink/60">Events tonight and in the next two days, with the pages you need at the door.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {comingUp.map((e) => (
              <div key={e.id} className="rounded-xl border border-ink/10 bg-white p-4">
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-ink/50">
                  <span>#{e.number}</span>
                  {e.checkInOpen && <span className="rounded-full bg-green/15 px-2 py-0.5 font-bold text-green-dark">Check-in is open</span>}
                </div>
                <div className="mt-1 font-bold text-ink">{e.label}</div>
                <div className="text-sm text-ink/60">{e.when} · {e.venue}, {e.city}</div>
                <div className="mt-1 text-sm text-ink">
                  {countOf(e.booked, 'person', 'people')} booked{e.checkInOpen || e.checkedIn > 0 ? ` · ${e.checkedIn} checked in` : ''}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/admin/events/${e.id}/bookings`} className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-lg bg-coral px-3 text-sm font-bold text-white hover:bg-coral/90">Bookings</Link>
                  <Link href={`/admin/events/${e.id}/checkin-qr`} className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-lg border border-plum px-3 text-sm font-bold text-plum hover:bg-plum/5">Check-in QR</Link>
                  <Link href={`/admin/events/${e.id}`} className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-lg border border-plum px-3 text-sm font-bold text-plum hover:bg-plum/5">Event page</Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Same order as the admin menu. */}
        <DashCard href="/admin/events" title="Events" desc="Create and manage events" />
        <DashCard href="/admin/blasts" title="Blasts" desc="Newsletters and SMS campaigns" />
        <DashCard href="/admin/members" title="Members" desc="Search, add, and export members" />
        <DashCard href="/admin/venues" title="Venues" desc="The venue directory used by events and blasts" />
        <DashCard href="/admin/discounts" title="Discount codes" desc="Create and edit promo codes" />
        <DashCard href="/admin/event-types" title="Event Types" desc="The event types offered when creating an event" />
        <DashCard href="/admin/feedback" title="Member Feedback" desc="Everything members have sent from the Feedback page" />
        <DashCard href="/admin/reports" title="Reports" desc="Attendance, revenue, and matches" />
        <DashCard href="/account" title="My Account" desc="Your profile and password" />
      </div>
    </div>
  );
}

/**
 * Events whose night isn't over yet (it ends at midnight in the event's
 * city) and that start within the next two days, soonest first. Cancelled
 * ones are left out; hidden ones are in (they still go ahead).
 */
async function comingUpEvents() {
  const now = new Date();
  const events = await prisma.event.findMany({
    where: {
      status: { not: 'CANCELLED' },
      startsAt: { gte: new Date(now.getTime() - 24 * 3600e3), lte: new Date(now.getTime() + 48 * 3600e3) },
    },
    orderBy: { startsAt: 'asc' },
    take: 8,
    include: { theme: true, city: true, venue: true },
  });
  const live = events.filter((e) => now < endOfEventNight(e)).slice(0, 4);
  if (!live.length) return [];
  const counts = await prisma.booking.groupBy({
    by: ['eventId', 'checkedIn'],
    where: { eventId: { in: live.map((e) => e.id) }, status: 'CONFIRMED' },
    _count: { _all: true },
  });
  return live.map((e) => {
    const tz = timeZoneForCity(e.city.name);
    // The event's own clock; "(Perth time)" when that isn't Sydney's.
    const note = zoneNote(e.startsAt, tz, EVENT_TIME_ZONE, e.city.name);
    const mine = counts.filter((c) => c.eventId === e.id);
    return {
      id: e.id,
      number: e.number,
      label: eventLabel(e),
      when: `${formatEventWhen(e.startsAt, tz)}${note ? ` (${note})` : ''}`,
      venue: e.venue.name,
      city: e.city.name,
      booked: mine.reduce((n, c) => n + c._count._all, 0),
      checkedIn: mine.filter((c) => c.checkedIn).reduce((n, c) => n + c._count._all, 0),
      checkInOpen: checkInState(e, now) === 'open',
    };
  });
}

function DashCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="block rounded-xl border border-ink/10 bg-white p-5 hover:border-green">
      <h2 className="font-extrabold text-plum">{title}</h2>
      <p className="mt-1 text-sm text-ink/60">{desc}</p>
    </Link>
  );
}
