import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { buildReport, reportProblem, showsSignups } from '@/lib/reports/breakdown';
import { reportFiltersSchema, loadReportFacts, hasMemberFilters, hasEventOnlyFilters, queryValues } from '@/lib/reports/facts';

const querySchema = reportFiltersSchema.extend({
  category: z.enum(['month', 'ageGroup', 'location', 'venue']).default('month'),
  group: z.enum(['month', 'ageGroup', 'location', 'venue', 'event', 'none']).default('none'),
  type: z.enum(['all', 'profitLoss']).default('all'),
});

// GET /api/admin/reports/breakdown — the Summary report table: "Categorise
// by / Group by / Report type" plus the Restrict To filters. Built from the
// same facts as the Overview under it (src/lib/reports/facts.ts).
//
// Definitions (shown under the report too):
//   Signups  — registrations (by the date they joined, their city, their age then)
//   Members  — different members with a paid booking
//   Bookings — paid bookings (Pay at door and cash included, as Gil asked)
//   Matches  — % of those members with at least one date or friend match,
//              over events whose results are in
//   Revenue  — what those bookings paid
//   Expenses — each event's expenses, once per event; Profit = Revenue − Expenses
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const parsed = querySchema.safeParse(queryValues(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Please check the report options.' }, { status: 400 });
  const q = parsed.data;

  const problem = reportProblem({ category: q.category, group: q.group, type: q.type, memberFilters: hasMemberFilters(q) });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const withSignups = showsSignups({ category: q.category, group: q.group, type: q.type, eventOnlyFilters: hasEventOnlyFilters(q) });
  const facts = await loadReportFacts(q, { signups: withSignups });

  const report = buildReport({ category: q.category, group: q.group, type: q.type, ...facts });
  return NextResponse.json({ ...report, signupsHidden: q.type === 'all' && facts.signups === null });
});
