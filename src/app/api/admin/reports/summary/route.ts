import { NextRequest, NextResponse } from 'next/server';
import { requireStaff, scopeReportFilters, notAuthorized } from '@/lib/staff';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { buildOverview } from '@/lib/reports/breakdown';
import { reportFiltersSchema, loadReportFacts, hasMemberFilters, hasEventOnlyFilters, queryValues } from '@/lib/reports/facts';

// GET /api/admin/reports/summary — the Overview under the report table: the
// headline figures, the charts and the "By event type" / "By city" tables.
// Same Restrict To filters, same facts and same arithmetic as the table
// (src/lib/reports/facts.ts, buildOverview), so the two always agree.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const staff = await requireStaff(req);
  if (!staff) return notAuthorized();

  const parsed = reportFiltersSchema.safeParse(queryValues(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Please check the report options.' }, { status: 400 });
  // A franchisee's: their locations, within their agreement's dates.
  const { q, cityIds } = scopeReportFilters(staff, parsed.data);

  const facts = await loadReportFacts(q, { signups: !hasEventOnlyFilters(q), cityIds });
  return NextResponse.json(buildOverview({ ...facts, memberFilters: hasMemberFilters(q) }));
});
