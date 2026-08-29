'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { BRAND_NAME } from '@/lib/brand';

// Header, footer and page container for every non-admin route.
//
// WHICH NAV IS SHOWN DEPENDS ON WHO IS ASKING, NOT WHICH PAGE THEY ARE ON.
// This used to be decided by pathname — a hardcoded list of "marketing"
// paths got the public nav and everything else got the member nav. That was
// wrong in both directions: a logged-out visitor browsing /events or /contact
// was shown "My Events / My Matches / My Account" (links that only 401 for
// them), and the public pages were unreachable from the member nav.
// `isLoggedIn` is resolved in the root layout, server-side, so the correct
// nav is in the very first HTML response.
//
// The homepage runs its hero and CTA bands edge to edge, so it opts out of
// the centred <main> container that every other member-facing page uses.
const FULL_BLEED_PATHS = ['/'];

// Admin screens use a wider container than the rest of the site
// (admin/layout.tsx: max-w-[1400px]). The header matches it on those routes
// so the right-aligned nav lines up with the edge of the content below it
// rather than stopping short of it.
const ADMIN_CONTAINER = 'max-w-[1400px]';
const SITE_CONTAINER = 'max-w-6xl';

export default function SiteChrome({
  children,
  isLoggedIn,
  isAdmin,
}: {
  children: React.ReactNode;
  isLoggedIn: boolean;
  /** The VIEWER is an admin — distinct from isAdminRoute below, which is
      about which page is being shown. An admin keeps the admin nav
      everywhere, including on the public homepage. */
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const isFullBleed = pathname != null && FULL_BLEED_PATHS.includes(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Three audiences, one header. The admin nav lives here rather than in
  // admin/layout.tsx so it travels with the admin onto every page — an admin
  // who clicked the logo through to the homepage previously got the member
  // menu and had to type /admin to get back.
  const navLinks = isAdmin
    ? [
        { href: '/admin', label: 'Dashboard' },
        { href: '/admin/events', label: 'Events' },
        { href: '/admin/members', label: 'Members' },
        { href: '/admin/discounts', label: 'Discount codes' },
        { href: '/admin/blasts', label: 'Blasts' },
        { href: '/admin/reports', label: 'Reports' },
        { href: '/account', label: 'My Account' },
      ]
    : isLoggedIn
      ? [
          { href: '/events', label: 'My Events' },
          { href: '/matches', label: 'My Matches' },
          { href: '/account', label: 'My Account' },
        ]
      : [
          { href: '/events', label: 'Upcoming Events' },
          { href: '/contact', label: 'Contact' },
        ];

  const container = isAdminRoute ? ADMIN_CONTAINER : SITE_CONTAINER;
  const closeMobile = () => setMobileOpen(false);

  // The admin nav is seven items wide and won't fit beside the logo on a
  // tablet, so it collapses into the burger later than the two- and
  // three-item navs do. Full class strings, not interpolated fragments —
  // Tailwind only generates classes it can find literally in the source.
  const navVisible = isAdmin ? 'hidden lg:flex' : 'hidden sm:flex';
  const burgerVisible = isAdmin ? 'lg:hidden' : 'sm:hidden';

  return (
    <>
      <header className="border-b-4 border-green bg-white">
        <div className={`mx-auto flex ${container} items-center justify-between gap-4 px-5 py-3`}>
          {/* Always the homepage. The logo used to point at /events, which
              sent a logged-out visitor into the app rather than to the page
              that explains what FastMatch is. For members it is still one
              click to their events via the nav. */}
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt={BRAND_NAME} width={210} height={64} priority />
          </Link>

          <nav className={`${navVisible} items-center gap-1 text-sm font-bold text-plum`}>
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 hover:bg-plum/5">{l.label}</Link>
            ))}
            {!isLoggedIn && (
              <>
                <Link href="/login" className="ml-2 rounded-lg border border-plum px-3 py-2 hover:bg-plum/5">Log In</Link>
                <Link href="/register" className="rounded-lg bg-coral px-4 py-2 text-white hover:bg-coral/90">Sign Up</Link>
              </>
            )}
          </nav>

          <button
            type="button"
            className={`text-plum ${burgerVisible}`}
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-label="Menu"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
        </div>

        {mobileOpen && (
          <nav className={`flex flex-col gap-1 border-t border-ink/10 bg-white px-5 py-3 text-sm font-bold text-plum ${burgerVisible}`}>
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 hover:bg-plum/5" onClick={closeMobile}>{l.label}</Link>
            ))}
            {!isLoggedIn && (
              <>
                <Link href="/login" className="rounded-lg border border-plum px-3 py-2 text-center hover:bg-plum/5" onClick={closeMobile}>Log In</Link>
                <Link href="/register" className="rounded-lg bg-coral px-4 py-2 text-center text-white hover:bg-coral/90" onClick={closeMobile}>Sign Up</Link>
              </>
            )}
          </nav>
        )}
      </header>

      {/* flex-1 makes the content area absorb any leftover viewport height, so
          the footer below it sits at the bottom of the screen rather than
          immediately under short content.

          Admin routes and the homepage both opt out of the centred max-w-5xl
          <main>: admin/layout.tsx owns its own wider max-w-[1400px] container
          (nesting it inside this one silently squeezed it back to 1024px),
          and the homepage runs its hero edge to edge. */}
      {isAdminRoute || isFullBleed ? (
        <div className="flex-1">{children}</div>
      ) : (
        <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">{children}</main>
      )}

      <SiteFooter isLoggedIn={isLoggedIn} isAdmin={isAdmin} container={container} />
    </>
  );
}

// Shared by the public/member pages and the admin pages, so the two can't
// drift apart. It carries the Terms and Privacy links, which have to stay
// reachable from anywhere.
function SiteFooter({
  isLoggedIn,
  isAdmin,
  container,
}: {
  isLoggedIn: boolean;
  isAdmin: boolean;
  container: string;
}) {
  return (
    <footer className="bg-plum-dark px-5 py-10 text-white">
      <div className={`mx-auto ${container}`}>
        <div className="mb-6 flex flex-wrap gap-x-8 gap-y-2 text-sm font-bold">
          {/* An admin gets no navigation duplicated down here. All seven admin
              destinations are already in the header on every page, so
              repeating them would just be a second menu competing with the
              first — the thing we removed from the admin layout. What the
              footer uniquely carries is Contact and the two legal pages. */}
          {!isAdmin && (
            <>
              <Link href="/events" className="hover:text-green">{isLoggedIn ? 'My Events' : 'Upcoming Events'}</Link>
              {isLoggedIn && <Link href="/matches" className="hover:text-green">My Matches</Link>}
              {isLoggedIn && <Link href="/account" className="hover:text-green">My Account</Link>}
            </>
          )}
          <Link href="/contact" className="hover:text-green">Contact</Link>
          <Link href="/terms" className="hover:text-green">Terms &amp; Conditions</Link>
          <Link href="/privacy" className="hover:text-green">Privacy Policy</Link>
        </div>
        <p className="text-xs text-white/60">
          © {new Date().getFullYear()} {BRAND_NAME} — Connecting People Face to Face.
          Australia&apos;s original speed dating organizer, since 1999.
        </p>
      </div>
    </footer>
  );
}
