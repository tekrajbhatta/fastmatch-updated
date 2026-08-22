import type { Metadata } from 'next';
import { BRAND_TAGLINE } from '@/lib/brand';
import SiteChrome from '@/components/SiteChrome';
import './globals.css';

export const metadata: Metadata = {
  title: 'FastMatch — Speed Dating Sydney',
  description: BRAND_TAGLINE,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
      <body suppressHydrationWarning className="min-h-screen bg-cream/30">
        {/*
          The member header and its max-w-5xl <main> used to live here, which
          wrapped EVERY route including /admin — showing the member nav above
          the admin nav, and nesting admin's own max-w-[1400px] container
          inside a 1024px one. SiteChrome renders them only on member routes.
        */}
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
