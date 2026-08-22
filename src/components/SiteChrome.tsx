'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { BRAND_NAME } from '@/lib/brand';

// Admin pages get their own header/nav/width entirely (see
// src/app/admin/layout.tsx) — this component used to be hardcoded into the
// root layout, which wrapped every route including /admin in the member
// header AND a max-w-5xl <main>. That caused two real bugs: the member nav
// (Events/My Matches/Account) showing up above the admin nav on every admin
// page, and admin's own max-w-[1400px] container being silently squeezed
// back down to 1024px since it was nested inside the outer max-w-5xl.
export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  if (isAdmin) {
    // No member header, no width constraint — admin/layout.tsx owns both.
    return <>{children}</>;
  }

  return (
    <>
      <header className="border-b-4 border-green bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <Link href="/events" className="flex items-center gap-2">
            <Image src="/logo.png" alt={BRAND_NAME} width={140} height={44} priority />
          </Link>
          <nav className="flex items-center gap-1 text-sm font-bold text-plum">
            <Link href="/events" className="rounded-lg px-3 py-2 hover:bg-plum/5">My Events</Link>
            <Link href="/matches" className="rounded-lg px-3 py-2 hover:bg-plum/5">My Matches</Link>
            <Link href="/account" className="rounded-lg px-3 py-2 hover:bg-plum/5">My Account</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </>
  );
}
