import type { Metadata } from 'next';
import { adminTitle } from '@/lib/pageTitles';

// The browser tab's title for this page (the page itself is a client component).
export const metadata: Metadata = { title: adminTitle('Blast filtered members') };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
