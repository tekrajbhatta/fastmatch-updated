import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentMember } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentMember();
  if (!member || !member.isAdmin) redirect('/login');

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <nav className="mb-8 flex flex-wrap gap-1 border-b border-ink/10 pb-4 text-sm font-bold text-plum">
        <Link href="/admin" className="rounded-lg px-3 py-2 hover:bg-plum/5">Dashboard</Link>
        <Link href="/admin/members" className="rounded-lg px-3 py-2 hover:bg-plum/5">Members</Link>
        <Link href="/admin/discounts" className="rounded-lg px-3 py-2 hover:bg-plum/5">Discount codes</Link>
        <Link href="/admin/reports" className="rounded-lg px-3 py-2 hover:bg-plum/5">Reports</Link>
      </nav>
      {children}
    </div>
  );
}
