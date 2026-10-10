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

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const short = parsed.error.issues.some((i) => i.path[0] === 'newPassword');
    return NextResponse.json(
      short
        ? { error: 'Your new password needs at least 8 characters.', field: 'newPassword' }
        : { error: 'Please enter your current password.', field: 'currentPassword' },
      { status: 400 },
    );
  }

  // 400, not 401: the member IS logged in, and the page reads a 401 as an
  // ended session ("Your session has expired").
  const ok = await bcrypt.compare(parsed.data.currentPassword, member.passwordHash);
  if (!ok) return NextResponse.json({ error: 'Current password is incorrect.', field: 'currentPassword' }, { status: 400 });

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  // Their own now: no longer "the password FastMatch set" (src/lib/adminMember.ts).
  const updated = await prisma.member.update({ where: { id: member.id }, data: { passwordHash, passwordSetByAdmin: false } });

  // Sessions are tied to the password, so the change signs out every other
  // device. This one gets a fresh session and stays logged in.
  const res = NextResponse.json({ ok: true });
  res.cookies.set('fm_session', signSession(updated), SESSION_COOKIE_OPTIONS);
  return res;
});
