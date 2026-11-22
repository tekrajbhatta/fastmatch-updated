import type { Metadata } from 'next';
import { pageTitle } from '@/lib/pageTitles';
import { sendOnIfLoggedIn } from '@/lib/alreadyLoggedIn';

// The browser tab's title for this page (the page itself is a client component).
export const metadata: Metadata = { title: pageTitle('Log in') };

// Already logged in: on to My account (or where ?next= says) instead of the form.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await sendOnIfLoggedIn();
  return children;
}
