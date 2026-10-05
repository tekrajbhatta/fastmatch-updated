import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { getCurrentMember } from '@/lib/auth';
import { adminTitle, eventTitle } from '@/lib/pageTitles';

// "#123 Speed Dating, 28-40 years, Sydney". Only an admin's tab gets the
// details: anyone else sees the "for FastMatch staff" page.
export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  if (!(await getCurrentMember())?.isAdmin) return { title: adminTitle('Event') };
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { number: true, name: true, theme: { select: { name: true } }, city: { select: { name: true } } },
  });
  return { title: adminTitle(event ? `#${event.number} ${eventTitle(event)}` : 'Event') };
}

export default function AdminEventLayout({ children }: { children: React.ReactNode }) {
  return children;
}
