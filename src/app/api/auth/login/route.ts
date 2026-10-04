import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { signSession, SESSION_COOKIE_OPTIONS } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { clientIp, clearRateLimit, hitRateLimit, isRateLimited, LIMITS, rateKey } from '@/lib/rateLimit';
import { unfinishedSteps } from '@/lib/accountSetup';
import { emailWelcomeLinkOnLogin } from '@/lib/welcomeLink';

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 400 });
  }

  // Failed attempts are counted per account and per address; past the limit
  // the account waits out the window (even with the right password), which
  // stops passwords being guessed. A successful login clears the account's count.
  const emailKey = rateKey('login-email', parsed.data.email);
  const ipKey = rateKey('login-ip', clientIp(req));
  if (
    (await isRateLimited(emailKey, LIMITS.loginEmail.limit)) ||
    (await isRateLimited(ipKey, LIMITS.loginIp.limit))
  ) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait 15 minutes and try again, or use "Forgot password?".' },
      { status: 429 },
    );
  }

  const member = await prisma.member.findUnique({ where: { email: parsed.data.email } });

  // Same error message whether the email doesn't exist or the password is
  // wrong — don't reveal which one, so this can't be used to enumerate emails.
  const invalid = async () => {
    await hitRateLimit(emailKey, LIMITS.loginEmail.limit, LIMITS.loginEmail.windowMs);
    await hitRateLimit(ipKey, LIMITS.loginIp.limit, LIMITS.loginIp.windowMs);
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  };

  if (!member) return invalid();
  const ok = await bcrypt.compare(parsed.data.password, member.passwordHash);
  if (!ok) {
    // Someone a friend booked in (or invited) has no password yet, so none
    // can be right: quietly email them a fresh link to set one. The reply is
    // the same as for any wrong password (the page adds a general "Booked in
    // by a friend?" line for everyone), and the email goes after it, so
    // neither says whether the account exists.
    if (member.awaitingPasswordSetup) after(() => emailWelcomeLinkOnLogin(member));
    return invalid();
  }
  await clearRateLimit(emailKey);

  const token = signSession(member);
  // Something still to do before they can book (email or mobile unconfirmed,
  // terms not accepted): the page takes them to "Finish setting up your account".
  const unfinished = !member.isAdmin && unfinishedSteps(member).length > 0;
  const res = NextResponse.json({ id: member.id, name: member.name, isAdmin: member.isAdmin, unfinished });
  res.cookies.set('fm_session', token, SESSION_COOKIE_OPTIONS);
  return res;
});
