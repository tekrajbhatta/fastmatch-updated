'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';

// Header, footer and page frame for every route.
//
// WHICH NAV IS SHOWN DEPENDS ON WHO IS ASKING, NOT WHICH PAGE THEY ARE ON.
// This used to be decided by pathname — a hardcoded list of "marketing"
// paths got the public nav and everything else got the member nav. That was
// wrong in both directions: a logged-out visitor browsing /events or /contact
// was shown the member links (links that only 401 for
// them), and the public pages were unreachable from the member nav.
// `isLoggedIn` is resolved in the root layout, server-side, so the correct
// nav is in the very first HTML response.
//
// Member-facing pages run edge to edge — most open with a full-width plum
// band — so each one lays out its own container (see components/site).

// Admin screens use a wider container than the rest of the site
// (admin/layout.tsx: max-w-[1400px]). The header matches it on those routes
// so the right-aligned nav lines up with the edge of the content below it
// rather than stopping short of it.
const ADMIN_CONTAINER = 'max-w-[1400px] px-6 md:px-10';
const SITE_CONTAINER = 'max-w-[1264px] px-5 md:px-8';

interface NavLink { href: string; label: string }

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
  const pathname = usePathname() ?? '';
  const isAdminRoute = pathname.startsWith('/admin');
  const [mobileOpen, setMobileOpen] = useState(false);

  // Following a link from the open menu lands on a new page with the menu
  // shut, and Escape closes it without choosing anything.
  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  // Three audiences, one header. The admin nav lives here rather than in
  // admin/layout.tsx so it travels with the admin onto every page — an admin
  // who clicked the logo through to the homepage previously got the member
  // menu and had to type /admin to get back.
  const navLinks: NavLink[] = isAdmin
    ? [
        { href: '/admin', label: 'Dashboard' },
        { href: '/admin/events', label: 'Events' },
        { href: '/admin/venues', label: 'Venues' },
        { href: '/admin/members', label: 'Members' },
        { href: '/admin/feedback', label: 'Member Feedback' },
        { href: '/admin/discounts', label: 'Discount codes' },
        { href: '/admin/blasts', label: 'Blasts' },
        { href: '/admin/reports', label: 'Reports' },
        { href: '/account', label: 'My Account' },
      ]
    : isLoggedIn
      ? [
          // Gil's names, from the old site's "My FastMatch" menu.
          { href: '/events', label: 'Upcoming Events' },
          { href: '/matches', label: 'My Match History' },
          { href: '/feedback', label: 'Feedback' },
          { href: '/tell-a-friend', label: 'Tell A Friend' },
          { href: '/account', label: 'My Account' },
        ]
      : [
          { href: '/events', label: 'Upcoming Events' },
          { href: '/contact', label: 'Contact' },
        ];

  // The dashboard is the prefix of every admin path, so it only counts as
  // the current page when it IS the page; everything else also covers the
  // pages beneath it (an event's page sits under Upcoming Events).
  const isCurrent = (href: string) =>
    href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const container = isAdminRoute ? ADMIN_CONTAINER : SITE_CONTAINER;
  const closeMobile = () => setMobileOpen(false);

  // The admin (nine items) and member (five) navs won't fit beside the logo
  // on a tablet, so they collapse into the menu button later than the
  // two-item public nav does — the admin one latest of all. The header's own
  // size switches at the same point, so the compact header is always the one
  // with the menu button. Full class strings, not interpolated fragments —
  // Tailwind only generates classes it can find literally in the source.
  const bp = isAdmin
    ? { nav: 'hidden xl:flex', burger: 'xl:hidden', bar: 'h-[68px] xl:h-[88px]', logo: 'w-[150px] xl:w-[200px]', links: 'gap-5 text-[15px]' }
    : isLoggedIn
      ? { nav: 'hidden lg:flex', burger: 'lg:hidden', bar: 'h-[68px] lg:h-[88px]', logo: 'w-[150px] lg:w-[200px]', links: 'gap-8 text-base' }
      : { nav: 'hidden md:flex', burger: 'md:hidden', bar: 'h-[68px] md:h-[88px]', logo: 'w-[150px] md:w-[200px]', links: 'gap-8 text-base' };

  return (
    <>
      {/* print:hidden — printed reports are just the report. */}
      <header className="relative z-40 border-b border-line bg-white print:hidden">
        <div className={`mx-auto flex ${container} ${bp.bar} items-center justify-between gap-6`}>
          {/* Always the homepage. The logo used to point at /events, which
              sent a logged-out visitor into the app rather than to the page
              that explains what FastMatch is. For members it is still one
              click to their events via the nav. */}
          <Link href="/" className="flex shrink-0 rounded-md focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-plum-700">
            <Image src="/logo.png" alt={`${BRAND_NAME} — ${BRAND_TAGLINE}`} width={200} height={61} priority className={`h-auto ${bp.logo}`} />
          </Link>

          <nav aria-label="Main" className={`${bp.nav} items-center ${bp.links}`}>
            {navLinks.map((l) => {
              const current = isCurrent(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={current ? 'page' : undefined}
                  className="relative whitespace-nowrap rounded-sm py-1.5 font-bold text-plum-900 hover:text-plum-700 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-plum-700"
                >
                  {l.label}
                  {current && <span aria-hidden="true" className="absolute inset-x-0 -bottom-1 h-1 rounded bg-match-400" />}
                </Link>
              );
            })}
            {!isLoggedIn && (
              <div className="flex gap-2.5">
                <Link href="/login" className="flex h-11 items-center rounded-full border-[1.5px] border-plum-700 px-5 font-bold text-plum-700 transition-colors hover:bg-plum-700 hover:text-white focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-plum-700">Log In</Link>
                <Link href="/register" className="flex h-11 items-center rounded-full bg-coral-600 px-5 font-bold text-white transition-colors hover:bg-coral-700 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-plum-700">Sign Up</Link>
              </div>
            )}
          </nav>

          <button
            type="button"
            className={`${bp.burger} relative -mr-1.5 flex h-12 w-12 flex-col items-center justify-center gap-[5px] rounded-field bg-[#F3EDF9] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-plum-700`}
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-controls="site-menu"
            aria-label="Menu"
          >
            {mobileOpen ? (
              <>
                <span aria-hidden="true" className="absolute h-[2.5px] w-[22px] rotate-45 rounded-sm bg-plum-900" />
                <span aria-hidden="true" className="absolute h-[2.5px] w-[22px] -rotate-45 rounded-sm bg-plum-900" />
              </>
            ) : (
              <>
                <span aria-hidden="true" className="h-[2.5px] w-[22px] rounded-sm bg-plum-900" />
                <span aria-hidden="true" className="h-[2.5px] w-[22px] rounded-sm bg-plum-900" />
                <span aria-hidden="true" className="mr-2 h-[2.5px] w-[14px] rounded-sm bg-plum-900" />
              </>
            )}
          </button>
        </div>

        {mobileOpen && (
          <div
            id="site-menu"
            className={`${bp.burger} absolute inset-x-0 top-full flex min-h-[calc(100dvh-68px)] flex-col bg-plum-900 px-5 pb-8 pt-3`}
          >
            <nav aria-label="Main" className="flex flex-col">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={closeMobile}
                  aria-current={isCurrent(l.href) ? 'page' : undefined}
                  className={`border-b border-white/15 font-display font-bold tracking-[-0.02em] text-white hover:text-match-300 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-match-400 aria-[current=page]:text-match-300 ${
                    isAdmin ? 'py-3.5 text-[22px]' : 'py-5 text-[28px]'
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            {!isLoggedIn && (
              <div className="mt-7 flex flex-col gap-3">
                <Link href="/login" onClick={closeMobile} className="flex h-[54px] items-center justify-center rounded-full border-[1.5px] border-white text-[17px] font-bold text-white transition-colors hover:bg-white hover:text-plum-900 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-match-400">Log In</Link>
                <Link href="/register" onClick={closeMobile} className="flex h-[54px] items-center justify-center rounded-full bg-coral-600 text-[17px] font-bold text-white transition-colors hover:bg-coral-700 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-match-400">Sign Up</Link>
              </div>
            )}
          </div>
        )}
      </header>

      {/* flex-1 makes the content area absorb any leftover viewport height, so
          the footer below it sits at the bottom of the screen rather than
          immediately under short content.

          Admin keeps the frame it had: admin/layout.tsx owns its own
          max-w-[1400px] container, on the same faint lavender page
          background as before (a white base under cream/30). */}
      {isAdminRoute ? (
        <div className="flex flex-1 flex-col bg-white">
          <div className="flex-1 bg-cream/30">{children}</div>
        </div>
      ) : (
        <main className="flex flex-1 flex-col">{children}</main>
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
  const link = 'rounded-sm font-bold text-white hover:text-match-300 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-match-400';
  return (
    <footer className="bg-plum-950 print:hidden">
      <div className={`mx-auto flex flex-col gap-6 py-10 md:py-14 ${container}`}>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3.5 text-base">
          {/* An admin gets no navigation duplicated down here. All seven admin
              destinations are already in the header on every page, so
              repeating them would just be a second menu competing with the
              first — the thing we removed from the admin layout. What the
              footer uniquely carries is Contact and the two legal pages. */}
          {!isAdmin && (
            <>
              <Link href="/events" className={link}>Upcoming Events</Link>
              {isLoggedIn && <Link href="/matches" className={link}>My Match History</Link>}
              {isLoggedIn && <Link href="/feedback" className={link}>Feedback</Link>}
              {isLoggedIn && <Link href="/tell-a-friend" className={link}>Tell A Friend</Link>}
              {isLoggedIn && <Link href="/account" className={link}>My Account</Link>}
            </>
          )}
          <Link href="/contact" className={link}>Contact</Link>
          <Link href="/terms" className={link}>Terms &amp; Conditions</Link>
          <Link href="/privacy" className={link}>Privacy Policy</Link>
        </nav>
        <div className="h-px bg-white/[.12]" />
        <p className="text-sm leading-relaxed text-[#BFB0D4] text-pretty">
          © {new Date().getFullYear()} {BRAND_NAME} — {BRAND_TAGLINE}. Australia&apos;s original speed dating organizer, since 1999.
        </p>
      </div>
    </footer>
  );
}
