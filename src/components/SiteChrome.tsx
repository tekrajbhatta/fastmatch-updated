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
// Admin pages are exempt entirely — src/app/admin/layout.tsx owns its own
// header, nav and max-w-[1400px] container. Rendering this component's
// header above it would stack two navs, and its <main> would squeeze admin's
// wider container back down.

// The homepage runs its hero and CTA bands edge to edge, so it opts out of
// the centred <main> container that every other member-facing page uses.
const FULL_BLEED_PATHS = ['/'];

export default function SiteChrome({
  children,
  isLoggedIn,
}: {
  children: React.ReactNode;
  isLoggedIn: boolean;
}) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');
  const isFullBleed = pathname != null && FULL_BLEED_PATHS.includes(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isAdmin) {
    // Admin gets the site's logo header and footer, but deliberately NO nav
    // in the header: admin/layout.tsx renders its own (Dashboard / Events /
    // Members / …) directly below, and stacking the member nav on top of it
    // would put two competing menus on every admin screen. The logo is the
    // way back out to the public site.
    //
    // The content is wrapped rather than returned bare because <body> is a
    // column flex container — admin's own `mx-auto max-w-[1400px]` container
    // behaves predictably as a normal block child, not as a flex item.
    return (
      <>
        <header className="border-b-4 border-green bg-white">
          <div className="mx-auto flex max-w-6xl items-center px-5 py-3">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/logo.png" alt={BRAND_NAME} width={210} height={64} priority />
            </Link>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <SiteFooter isLoggedIn={isLoggedIn} />
      </>
    );
  }

  // Logged-out visitors get the public/marketing nav; members get the app
  // nav. Both keep Contact reachable, since a member needing help shouldn't
  // have to log out to find it.
  const navLinks = isLoggedIn
    ? [
        { href: '/events', label: 'My Events' },
        { href: '/matches', label: 'My Matches' },
        { href: '/account', label: 'My Account' },
      ]
    : [
        { href: '/events', label: 'Upcoming Events' },
        { href: '/contact', label: 'Contact' },
      ];

  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      <header className="border-b-4 border-green bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          {/* Always the homepage. The logo used to point at /events, which
              sent a logged-out visitor into the app rather than to the page
              that explains what FastMatch is. For members it is still one
              click to their events via the nav. */}
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt={BRAND_NAME} width={210} height={64} priority />
          </Link>

          <nav className="hidden items-center gap-1 text-sm font-bold text-plum sm:flex">
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

        {mobileOpen && (
          <nav className="flex flex-col gap-1 border-t border-ink/10 bg-white px-5 py-3 text-sm font-bold text-plum sm:hidden">
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
          immediately under short content. */}
      {isFullBleed ? (
        <div className="flex-1">{children}</div>
      ) : (
        <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">{children}</main>
      )}

      <SiteFooter isLoggedIn={isLoggedIn} />
    </>
  );
}

// Shared by the public/member pages and the admin pages, so the two can't
// drift apart. It carries the Terms and Privacy links, which have to stay
// reachable from anywhere.
function SiteFooter({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <footer className="bg-plum-dark px-5 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap gap-x-8 gap-y-2 text-sm font-bold">
          <Link href="/events" className="hover:text-green">{isLoggedIn ? 'My Events' : 'Upcoming Events'}</Link>
          {isLoggedIn && <Link href="/matches" className="hover:text-green">My Matches</Link>}
          {isLoggedIn && <Link href="/account" className="hover:text-green">My Account</Link>}
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
