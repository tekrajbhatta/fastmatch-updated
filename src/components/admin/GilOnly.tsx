import Link from 'next/link';
import { getCurrentStaff } from '@/lib/staff';
import { FormCard } from '@/components/site/layout';
import { ButtonLink, linkClass } from '@/components/site/button';

/**
 * For the admin sections that stay Gil's (Blasts, Affiliates, Franchises,
 * Event Types, Member Feedback, editing members, an event's matches): a
 * franchisee who finds their address sees this instead. Like the admin
 * layout's card, it isn't the lock: their API routes are Gil's only
 * (requireAdmin).
 */
export default async function GilOnly({ children }: { children: React.ReactNode }) {
  const staff = await getCurrentStaff();
  if (!staff || staff.isAdmin) return children;
  return (
    <div className="flex flex-1 items-start justify-center px-4 py-[clamp(40px,7.2vw,104px)]">
      <FormCard className="text-center">
        <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-ink-900">This page is for FastMatch head office</h1>
        <p className="text-base leading-relaxed text-ink-600">It isn&apos;t part of the franchise admin. Everything for your locations is in the menu above.</p>
        <ButtonLink href="/admin" block>Dashboard</ButtonLink>
        <Link href="/admin/events" className={`${linkClass} self-center text-[15px]`}>Events</Link>
      </FormCard>
    </div>
  );
}
