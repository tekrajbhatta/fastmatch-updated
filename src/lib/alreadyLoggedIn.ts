import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentMember } from './auth';
import { PATH_HEADER } from './pathHeader';
import { alreadyLoggedInHref } from './safeNext';

/**
 * For the Log in and Sign up pages' layouts: someone already logged in goes
 * on to My account (staff: the admin), or the `?next=` they came with
 * (src/lib/safeNext.ts has the rules). The session itself is checked here,
 * not just that the cookie is there, so an expired one still gets the form
 * (and isn't sent round to /account and back to /login). Middleware sets
 * the address asked for (src/middleware.ts).
 */
export async function sendOnIfLoggedIn(): Promise<void> {
  const member = await getCurrentMember();
  if (!member) return;
  const asked = (await headers()).get(PATH_HEADER) ?? '';
  redirect(alreadyLoggedInHref(asked, member.isAdmin || member.isFranchisee));
}
