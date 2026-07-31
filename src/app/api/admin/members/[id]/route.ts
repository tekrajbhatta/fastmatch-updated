import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

// GET /api/admin/members/:id — "click a member to view their details" on
// the real Members screen. Includes their booking and match history.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const member = await prisma.member.findUniqueOrThrow({
    where: { id: params.id },
    include: {
      city: true,
      bookings: { include: { event: true }, orderBy: { createdAt: 'desc' } },
    },
  });

  const matches = await prisma.match.findMany({
    where: { OR: [{ memberAId: params.id }, { memberBId: params.id }] },
  });

  // Never return the password hash to the admin UI
  const { passwordHash, ...safeMember } = member;

  return NextResponse.json({ ...safeMember, matches });
}
