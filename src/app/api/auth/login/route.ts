import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { signSession, SESSION_COOKIE_OPTIONS } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { clientIp, clearLoginLock, hitRateLimit, isRateLimited, LIMITS, loginKeys, rateKey } from '@/lib/rateLimit';
import { unfinishedSteps } from '@/lib/accountSetup';
import { emailWelcomeLinkOnLogin } from '@/lib/welcomeLink';

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// The password check is deliberately slow (about a quarter of a second), and
// it used to be skipped for an address that isn't a member's — so the reply
// came back faster, and timing it told whether someone is on FastMatch. Now an
// unknown address is checked against this throwaway hash instead (same cost
// as every real one), made on first use rather than at module scope.
let throwawayHash: Promise<string> | null = null;
const timingHash = () => (throwawayHash ??= bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12));
const isBcryptHash = (h: string) => /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(h);

export const POST = withErrorHandling(async (req: NextRequest) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 400 });
  }

  // Failed attempts are counted per account from this address, per account
  // from anywhere (a higher cap), and per address; past a limit, it waits out
  // the window (even with the right password), which stops passwords being
  // guessed. Per account AND address, so a stranger typing wrong passwords
  // elsewhere doesn't lock the member out. A successful login, or a password
  // reset, clears the account's counts.
  const ip = clientIp(req);
  const { emailKey, emailIpKey } = loginKeys(parsed.data.email, ip);
  const ipKey = rateKey('login-ip', ip);
  const tooMany = () => NextResponse.json(
    { error: 'Too many attempts. Please wait 15 minutes and try again, or use "Forgot password?".' },
    { status: 429 },
  );
  if (await isRateLimited(ipKey, LIMITS.loginIp.limit)) return tooMany();
  // Each attempt on the account is counted BEFORE the (slow) password check,
  // so a burst of guesses sent at once can't all be checked before any is
  // counted (a successful login clears these counts again).
  if (!(await hitRateLimit(emailIpKey, LIMITS.loginEmailIp.limit, LIMITS.loginEmailIp.windowMs)).allowed) return tooMany();
  if (!(await hitRateLimit(emailKey, LIMITS.loginEmail.limit, LIMITS.loginEmail.windowMs)).allowed) return tooMany();

  const member = await prisma.member.findUnique({ where: { email: parsed.data.email } });

  // Same error message whether the email doesn't exist or the password is
  // wrong — don't reveal which one, so this can't be used to enumerate emails.
  // (The address counts only failures: a venue's shared wifi sees many
  // members log in on the night.)
  const invalid = async () => {
    await hitRateLimit(ipKey, LIMITS.loginIp.limit, LIMITS.loginIp.windowMs);
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  };

  const realHash = member && isBcryptHash(member.passwordHash) ? member.passwordHash : null;
  const ok = (await bcrypt.compare(parsed.data.password, realHash ?? (await timingHash()))) && realHash !== null;
  if (!member) return invalid();
  if (!ok) {
    // Someone a friend booked in (or invited) has no password yet, so none
    // can be right: quietly email them a fresh link to set one. The reply is
    // the same as for any wrong password (the page adds a general "Booked in
    // by a friend?" line for everyone), and the email goes after it, so
    // neither says whether the account exists.
    if (member.awaitingPasswordSetup) after(() => emailWelcomeLinkOnLogin(member));
    return invalid();
  }
  await clearLoginLock(parsed.data.email, ip);

  const token = signSession(member);
  // Something still to do before they can book (email or mobile unconfirmed,
  // terms not accepted), or a password the admin set that they haven't yet
  // kept or replaced: the page takes them to "Finish setting up your account".
  const unfinished = !member.isAdmin && (unfinishedSteps(member).length > 0 || member.passwordSetByAdmin);
  const res = NextResponse.json({ id: member.id, name: member.name, isAdmin: member.isAdmin, unfinished });
  res.cookies.set('fm_session', token, SESSION_COOKIE_OPTIONS);
  return res;
});
