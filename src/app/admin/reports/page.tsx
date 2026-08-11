import Link from 'next/link';
import { Card } from '@/components/ui';

// PLACEHOLDER — Reports is the one spec module with no backend or UI yet
// (per-event report, summary by age group/city/theme, revenue and member-growth
// trends, shared filter panel — spec §2.5). This page exists so the nav and
// dashboard links don't 404 while it's being built. Replace wholesale.

export default function AdminReportsPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Reports</h1>
      <p className="mb-6 text-sm text-ink/60">Attendance, revenue, and match statistics.</p>
      <Card>
        <p className="mb-2 font-bold text-ink">Not built yet</p>
        <p className="text-sm text-ink/60">
          Per-event and summary reports (with city, age, date and theme filters) are on the
          build plan but not implemented. In the meantime, the{' '}
          <Link href="/admin/members" className="font-bold text-plum">Members screen</Link>{' '}
          shows live filtered totals, and each event's bookings screen shows its attendance
          and takings.
        </p>
      </Card>
    </div>
  );
}
