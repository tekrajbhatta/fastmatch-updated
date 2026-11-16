import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { getCurrentStaff, eventScope } from '@/lib/staff';
import { adminTitle, eventTitle } from '@/lib/pageTitles';

// "#123 Speed Dating, 28-40 years, Sydney". Only staff's tabs get the
// details (a franchisee's, only for an event in their locations): anyone else
// sees the "for FastMatch staff" page.
export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  // Checked here as well as in the admin layout: this runs whoever asks. A
  // non-staff tab keeps a plain title over the staff card, rather than
  // turning into "not found".
  const staff = await getCurrentStaff();
  if (!staff) return { title: adminTitle('Event') };
  const { eventId } = await params;
  const event = await prisma.event.findFirst({
    where: { id: eventId, ...eventScope(staff) },
    select: { number: true, name: true, theme: { select: { name: true } }, city: { select: { name: true } } },
  });
  return { title: adminTitle(event ? `#${event.number} ${eventTitle(event)}` : 'Event') };
}

export default function AdminEventLayout({ children }: { children: React.ReactNode }) {
  return children;
}
