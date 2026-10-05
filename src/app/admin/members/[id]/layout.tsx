import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { getCurrentMember } from '@/lib/auth';
import { adminTitle } from '@/lib/pageTitles';

// The member's name in the tab — for an admin only (anyone else sees the
// "for FastMatch staff" page, and their tab mustn't name the member either).
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  if (!(await getCurrentMember())?.isAdmin) return { title: adminTitle('Member') };
  const { id } = await params;
  const member = await prisma.member.findUnique({ where: { id }, select: { name: true } });
  return { title: adminTitle(member?.name ?? 'Member') };
}

export default function AdminMemberLayout({ children }: { children: React.ReactNode }) {
  return children;
}
