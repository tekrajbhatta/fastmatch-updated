import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { getCurrentStaff, canSeeCity } from '@/lib/staff';
import { eventTitle, pageTitle } from '@/lib/pageTitles';

// The browser tab names the event: "Speed Dating, 28-40 years, Sydney".
export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { name: true, draft: true, cityId: true, theme: { select: { name: true } }, city: { select: { name: true } } },
  });
  if (!event) return { title: pageTitle('Event') };
  // As on the page itself: a copy that's still a draft is staff's alone (Gil,
  // or the location's franchisee).
  if (event.draft) {
    const staff = await getCurrentStaff();
    if (!staff || !canSeeCity(staff, event.cityId)) return { title: pageTitle('Event') };
  }
  return { title: pageTitle(eventTitle(event)) };
}

export default function EventLayout({ children }: { children: React.ReactNode }) {
  return children;
}
