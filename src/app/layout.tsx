import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FastMatch',
  description: 'Speed dating events across Australia.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
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
      <body
        suppressHydrationWarning
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          lineHeight: 1.5,
        }}
      >
        {children}
      </body>
    </html>
  );
}
