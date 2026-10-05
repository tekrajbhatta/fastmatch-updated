import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { getCurrentMember } from '@/lib/auth';
import { adminTitle } from '@/lib/pageTitles';

// The blast's title in the tab, for an admin only.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  if (!(await getCurrentMember())?.isAdmin) return { title: adminTitle('Blast') };
  const { id } = await params;
  const blast = await prisma.campaign.findUnique({ where: { id }, select: { title: true } });
  return { title: adminTitle(blast ? `Blast: ${blast.title}` : 'Blast') };
}

export default function AdminBlastLayout({ children }: { children: React.ReactNode }) {
  return children;
}
