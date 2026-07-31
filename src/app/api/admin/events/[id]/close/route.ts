import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { calculateMatchesForEvent } from '@/lib/calculateMatches';
import { sendMatchEmails } from '@/lib/sendMatchEmails';

// POST /api/admin/events/:id/close — host's "Close event now & calculate early"
// override. Normally matches wait for the midnight job; this lets a host force
// it sooner. Same underlying calculation either way — no separate logic path.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const result = await calculateMatchesForEvent(params.id);
  if (!result.alreadyCalculated) {
    await sendMatchEmails(params.id);
  }

  return NextResponse.json(result);
}
