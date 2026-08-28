import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentMember } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentMember();
  // ?next= so logging in returns them to the admin area they asked for,
  // rather than dropping them on the member events list.
  if (!member || !member.isAdmin) redirect('/login?next=%2Fadmin');

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8 md:px-10">
      <nav className="mb-8 flex flex-wrap gap-1 border-b border-ink/10 pb-4 text-sm font-bold text-plum">
        {/* Order mirrors the dashboard cards below it. Events and Blasts were
            missing entirely — both had pages and were reachable only from the
            dashboard tiles, so there was no way back to them from any other
            admin screen. */}
        <Link href="/admin" className="rounded-lg px-3 py-2 hover:bg-plum/5">Dashboard</Link>
        <Link href="/admin/events" className="rounded-lg px-3 py-2 hover:bg-plum/5">Events</Link>
        <Link href="/admin/members" className="rounded-lg px-3 py-2 hover:bg-plum/5">Members</Link>
        <Link href="/admin/discounts" className="rounded-lg px-3 py-2 hover:bg-plum/5">Discount codes</Link>
        <Link href="/admin/blasts" className="rounded-lg px-3 py-2 hover:bg-plum/5">Blasts</Link>
        <Link href="/admin/reports" className="rounded-lg px-3 py-2 hover:bg-plum/5">Reports</Link>
      </nav>
      {children}
    </div>
  );
}
