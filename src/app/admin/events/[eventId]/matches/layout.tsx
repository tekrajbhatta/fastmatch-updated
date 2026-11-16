import type { Metadata } from 'next';
import { adminTitle } from '@/lib/pageTitles';
import GilOnly from '@/components/admin/GilOnly';

// The browser tab's title for this page (the page itself is a client component).
export const metadata: Metadata = { title: adminTitle('Matches and choices') };

export default function Layout({ children }: { children: React.ReactNode }) {
  // Gil's alone: a franchisee is told so (src/components/admin/GilOnly.tsx).
  return <GilOnly>{children}</GilOnly>;
}
