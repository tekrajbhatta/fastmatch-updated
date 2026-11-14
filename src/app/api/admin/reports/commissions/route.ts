import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { queryValues } from '@/lib/reports/facts';
import { commissionFiltersSchema, loadCommissionReport } from '@/lib/reports/commissions';

// GET /api/admin/reports/commissions — the Summary tab's "Commissions due to
// affiliates" report (src/lib/reports/commissions.ts).
export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  const parsed = commissionFiltersSchema.safeParse(queryValues(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Please check the report’s filters.' }, { status: 400 });
  return NextResponse.json(await loadCommissionReport(parsed.data));
});
