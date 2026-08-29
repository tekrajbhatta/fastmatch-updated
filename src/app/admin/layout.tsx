import { redirect } from 'next/navigation';
import { getCurrentMember } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentMember();
  // ?next= so logging in returns them to the admin area they asked for,
  // rather than dropping them on the member events list.
  if (!member || !member.isAdmin) redirect('/login?next=%2Fadmin');

  // The admin nav used to live here, on its own row below the logo. It now
  // sits in the site header beside the logo (see SiteChrome), which both
  // puts it on one row and carries it onto non-admin pages — an admin no
  // longer loses their menu by clicking through to the public site.
  return <div className="mx-auto max-w-[1400px] px-6 py-8 md:px-10">{children}</div>;
}
