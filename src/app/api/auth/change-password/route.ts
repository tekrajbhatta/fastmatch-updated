import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getSessionMember } from '@/lib/auth';

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

// POST /api/auth/change-password — for a logged-in member changing their
// password from Account, as opposed to /reset-password which is for someone
// who's forgotten it and is using an emailed token instead.
export async function POST(req: NextRequest) {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const ok = await bcrypt.compare(parsed.data.currentPassword, member.passwordHash);
  if (!ok) return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.member.update({ where: { id: member.id }, data: { passwordHash } });

  return NextResponse.json({ ok: true });
}
