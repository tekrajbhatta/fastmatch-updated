import type { Metadata } from 'next';
import { BRAND_TAGLINE } from '@/lib/brand';
import { getCurrentMember } from '@/lib/auth';
import SiteChrome from '@/components/SiteChrome';
import './globals.css';

export const metadata: Metadata = {
  title: 'FastMatch — Speed Dating Sydney',
  description: BRAND_TAGLINE,
};

// Resolved here, in a server component, rather than fetched by the client:
// the header must be correct on first paint. Fetching /api/auth/me from
// SiteChrome would render the logged-out nav, then visibly swap it — and a
// logged-in member would watch "My Account" flicker into "Sign Up".
//
// Reading the session cookie opts every route into dynamic rendering, so the
// pages that used to be statically prerendered (including "/") are now
// rendered per request. That is the necessary cost of a header that depends
// on who is asking; only a boolean crosses into the client bundle, never the
// member record.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentMember();

  return (
    <html lang="en">
      {/*
        suppressHydrationWarning: browser extensions (Grammarly, password
        managers, some ad blockers) inject attributes onto <body> before React
        hydrates — e.g. data-gr-ext-installed, data-new-gr-c-s-check-loaded —
        which React reports as a server/client mismatch. The attributes come
        from the user's browser, not from this app, so there is nothing to fix
        in the markup itself.

        This only suppresses warnings for THIS element's own attributes (React
        applies it one level deep), so genuine hydration bugs in the page
        content below still surface normally.
      */}
      {/*
        flex-col + a flex-1 content area (see SiteChrome) is what keeps the
        footer at the bottom of the viewport on short pages. Without it a page
        with little content — an empty events list, the login form — left the
        footer floating mid-screen with a band of background below it.
      */}
      <body suppressHydrationWarning className="flex min-h-screen flex-col bg-cream/30">
        {/*
          The member header and its max-w-5xl <main> used to live here, which
          wrapped EVERY route including /admin — showing the member nav above
          the admin nav, and nesting admin's own max-w-[1400px] container
          inside a 1024px one. SiteChrome renders them only on member routes.
        */}
        <SiteChrome isLoggedIn={member !== null}>{children}</SiteChrome>
      </body>
    </html>
  );
}
