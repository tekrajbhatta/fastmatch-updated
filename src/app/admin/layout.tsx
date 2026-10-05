import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getCurrentMember } from '@/lib/auth';
import { PATH_HEADER } from '@/lib/pathHeader';
import { isAdminPath } from '@/lib/accountSetup';
import { adminTitle } from '@/lib/pageTitles';
import { FormCard } from '@/components/site/layout';
import { ButtonLink, linkClass } from '@/components/site/button';

// Admin tabs read "Events | FastMatch admin", so they stand apart from the
// public site's when both are open.
export const metadata: Metadata = { title: adminTitle('Admin') };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentMember();
  if (!member) {
    // A session cookie that turned out to be expired or invalid (a logged-out
    // visitor never gets here: middleware sends them to login). Back to login
    // with the page they asked for, so they return to it, not the dashboard.
    const asked = (await headers()).get(PATH_HEADER) ?? '';
    redirect(`/login?next=${encodeURIComponent(isAdminPath(asked) ? asked : '/admin')}`);
  }
  // A member, not an admin: say so. Sending them to login used to loop —
  // logging in again just brought them back here.
  if (!member.isAdmin) {
    return (
      <div className="flex flex-1 items-start justify-center px-4 py-[clamp(40px,7.2vw,104px)]">
        <FormCard className="text-center">
          <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-ink-900">This area is for FastMatch staff</h1>
          <p className="text-base leading-relaxed text-ink-600">
            You&apos;re logged in as {member.name}, and this page is only for the people who run FastMatch.
          </p>
          <ButtonLink href="/events" block>Browse events</ButtonLink>
          <Link href="/account" className={`${linkClass} self-center text-[15px]`}>My account</Link>
        </FormCard>
      </div>
    );
  }

  // The admin nav used to live here, on its own row below the logo. It now
  // sits in the site header beside the logo (see SiteChrome), which both
  // puts it on one row and carries it onto non-admin pages — an admin no
  // longer loses their menu by clicking through to the public site.
  return <div className="mx-auto max-w-[1400px] px-6 py-8 md:px-10">{children}</div>;
}
