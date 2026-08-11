import Link from 'next/link';

export default function AdminDashboard() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Admin dashboard</h1>
      <p className="mb-6 text-sm text-ink/60">Manage events, members, discounts, blasts, and reports.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <DashCard href="/admin/events" title="Events" desc="Create and manage events" />
        <DashCard href="/admin/members" title="Members" desc="Search, add, and export members" />
        <DashCard href="/admin/discounts" title="Discount codes" desc="Create and edit promo codes" />
        <DashCard href="/admin/blasts" title="Blasts" desc="Newsletters and SMS campaigns" />
        <DashCard href="/admin/reports" title="Reports" desc="Attendance, revenue, and matches" />
      </div>
    </div>
  );
}

function DashCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="block rounded-xl border border-ink/10 bg-white p-5 hover:border-green">
      <h2 className="font-extrabold text-plum">{title}</h2>
      <p className="mt-1 text-sm text-ink/60">{desc}</p>
    </Link>
  );
}
