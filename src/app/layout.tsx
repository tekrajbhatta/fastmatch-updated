import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
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
        <header className="border-b-4 border-green bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
            <Link href="/events" className="flex items-center gap-2">
              <Image src="/logo.png" alt={BRAND_NAME} width={140} height={44} priority />
            </Link>
            <nav className="flex items-center gap-1 text-sm font-bold text-plum">
              <Link href="/events" className="rounded-lg px-3 py-2 hover:bg-plum/5">Events</Link>
              <Link href="/matches" className="rounded-lg px-3 py-2 hover:bg-plum/5">My Matches</Link>
              <Link href="/account" className="rounded-lg px-3 py-2 hover:bg-plum/5">Account</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
      </body>
    </html>
  );
}
