'use client';

import { useState } from 'react';
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
//
// The public homepage gets a third variant: a marketing nav (a first-time
// visitor has no events or matches yet, so "My Events / My Matches" is
// meaningless to them) and a footer, and critically NO max-w-5xl <main>
// wrapper — the homepage's hero and CTA bands run full-bleed.
//
// Only '/' for now. When the About / Common Questions / Tell a Friend pages
// are built, add their paths here and their links to both navs below.
const MARKETING_PATHS = ['/'];

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');
  const isMarketing = pathname != null && MARKETING_PATHS.includes(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isAdmin) {
    // No member header, no width constraint — admin/layout.tsx owns both.
    return <>{children}</>;
  }

  if (isMarketing) {
    return (
      <>
        <header className="border-b-4 border-green bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/logo.png" alt={BRAND_NAME} width={210} height={64} priority />
            </Link>
            <nav className="hidden items-center gap-1 text-sm font-bold text-plum sm:flex">
              <Link href="/events" className="rounded-lg px-3 py-2 hover:bg-plum/5">Upcoming Events</Link>
              <Link href="/contact" className="rounded-lg px-3 py-2 hover:bg-plum/5">Contact</Link>
              <Link href="/login" className="ml-2 rounded-lg border border-plum px-3 py-2 hover:bg-plum/5">Log In</Link>
              <Link href="/register" className="rounded-lg bg-coral px-4 py-2 text-white hover:bg-coral/90">Sign Up</Link>
            </nav>
            <button
              type="button"
              className="text-plum sm:hidden"
              onClick={() => setMobileOpen((open) => !open)}
              aria-expanded={mobileOpen}
              aria-label="Menu"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
          </div>
          {/* The mockup simply hides the nav below 800px, which would leave a
              phone with no way to reach Events or Sign Up — hence this. */}
          {mobileOpen && (
            <nav className="flex flex-col gap-1 border-t border-ink/10 bg-white px-5 py-3 text-sm font-bold text-plum sm:hidden">
              <Link href="/events" className="rounded-lg px-3 py-2 hover:bg-plum/5" onClick={() => setMobileOpen(false)}>Upcoming Events</Link>
              <Link href="/contact" className="rounded-lg px-3 py-2 hover:bg-plum/5" onClick={() => setMobileOpen(false)}>Contact</Link>
              <Link href="/login" className="rounded-lg border border-plum px-3 py-2 text-center hover:bg-plum/5" onClick={() => setMobileOpen(false)}>Log In</Link>
              <Link href="/register" className="rounded-lg bg-coral px-4 py-2 text-center text-white hover:bg-coral/90" onClick={() => setMobileOpen(false)}>Sign Up</Link>
            </nav>
          )}
        </header>

        {children}

        <footer className="bg-plum-dark px-5 py-10 text-white">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex flex-wrap gap-x-8 gap-y-2 text-sm font-bold">
              <Link href="/events" className="hover:text-green">Upcoming Events</Link>
              <Link href="/contact" className="hover:text-green">Contact</Link>
              <Link href="/terms" className="hover:text-green">Terms &amp; Conditions</Link>
              <Link href="/privacy" className="hover:text-green">Privacy Policy</Link>
            </div>
            <p className="text-xs text-white/60">
              © {new Date().getFullYear()} {BRAND_NAME} — Connecting People Face to Face.
              Australia&apos;s original speed dating, since 1999.
            </p>
          </div>
        </footer>
      </>
    );
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
