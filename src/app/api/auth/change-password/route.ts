import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getSessionMember, signSession, SESSION_COOKIE_OPTIONS } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

// POST /api/auth/change-password — for a logged-in member changing their
// password from Account, as opposed to /reset-password which is for someone
// who's forgotten it and is using an emailed token instead.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const ok = await bcrypt.compare(parsed.data.currentPassword, member.passwordHash);
  if (!ok) return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  const updated = await prisma.member.update({ where: { id: member.id }, data: { passwordHash } });

  // Sessions are tied to the password, so the change signs out every other
  // device. This one gets a fresh session and stays logged in.
  const res = NextResponse.json({ ok: true });
  res.cookies.set('fm_session', signSession(updated), SESSION_COOKIE_OPTIONS);
  return res;
});
