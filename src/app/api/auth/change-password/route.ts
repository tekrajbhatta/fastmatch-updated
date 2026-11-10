import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getSessionMember, signSession, SESSION_COOKIE_OPTIONS, rememberDevice } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { hitRateLimit, LIMITS, rateKey } from '@/lib/rateLimit';
import { passwordToCheck, PASSWORD_MAX, PASSWORD_TOO_LONG, TYPED_PASSWORD_MAX } from '@/lib/tokens';

const bodySchema = z.object({
  // The current password may be one chosen before there was a length limit
  // (see passwordToCheck); only the new one is held to PASSWORD_MAX.
  currentPassword: z.string().min(1).max(TYPED_PASSWORD_MAX),
  newPassword: z.string().min(8).max(PASSWORD_MAX),
});

// POST /api/auth/change-password — for a logged-in member changing their
// password from Account, as opposed to /reset-password which is for someone
// who's forgotten it and is using an emailed token instead.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const member = await getSessionMember(req);
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues.find((i) => i.path[0] === 'newPassword');
    const currentIssue = parsed.error.issues.find((i) => i.path[0] === 'currentPassword');
    if (!issue && currentIssue?.code === 'too_big') {
      return NextResponse.json({ error: 'Current password is incorrect.', field: 'currentPassword' }, { status: 400 });
    }
    return NextResponse.json(
      issue
        ? { error: issue.code === 'too_big' ? PASSWORD_TOO_LONG : 'Your new password needs at least 8 characters.', field: 'newPassword' }
        : { error: 'Please enter your current password.', field: 'currentPassword' },
      { status: 400 },
    );
  }

  // A few guesses at the current password per member: someone holding a
  // phone left logged in could otherwise try passwords here without end,
  // and each check keeps the server busy for a quarter of a second.
  const guesses = await hitRateLimit(rateKey('change-password', member.id), LIMITS.changePassword.limit, LIMITS.changePassword.windowMs);
  if (!guesses.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait 15 minutes and try again, or use "Forgot password?".' },
      { status: 429 },
    );
  }

  // 400, not 401: the member IS logged in, and the page reads a 401 as an
  // ended session ("Your session has expired").
  const ok = await bcrypt.compare(passwordToCheck(parsed.data.currentPassword), member.passwordHash);
  if (!ok) return NextResponse.json({ error: 'Current password is incorrect.', field: 'currentPassword' }, { status: 400 });

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  // Their own now: no longer "the password FastMatch set" (src/lib/adminMember.ts).
  const updated = await prisma.member.update({ where: { id: member.id }, data: { passwordHash, passwordSetByAdmin: false } });

  // Sessions are tied to the password, so the change signs out every other
  // device. This one gets a fresh session and stays logged in.
  const res = NextResponse.json({ ok: true });
  res.cookies.set('fm_session', signSession(updated), SESSION_COOKIE_OPTIONS);
  // The password was just typed in this browser (see fm_device in src/lib/auth.ts).
  rememberDevice(res, req, updated.id);
  return res;
});
