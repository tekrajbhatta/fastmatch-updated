import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { buildOverview } from '@/lib/reports/breakdown';
import { reportFiltersSchema, loadReportFacts, hasMemberFilters, hasEventOnlyFilters, queryValues } from '@/lib/reports/facts';

// GET /api/admin/reports/summary — the Overview under the report table: the
// headline figures, the charts and the "By event type" / "By city" tables.
// Same Restrict To filters, same facts and same arithmetic as the table
// (src/lib/reports/facts.ts, buildOverview), so the two always agree.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = reportFiltersSchema.safeParse(queryValues(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Please check the report options.' }, { status: 400 });
  const q = parsed.data;

  const facts = await loadReportFacts(q, { signups: !hasEventOnlyFilters(q) });
  return NextResponse.json(buildOverview({ ...facts, memberFilters: hasMemberFilters(q) }));
});
