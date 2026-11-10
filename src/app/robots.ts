import type { MetadataRoute } from 'next';

/**
 * /robots.txt: search engines may read the public pages, not the admin, the
 * members' own pages, the API or pages reached from emailed links (their
 * addresses carry tokens). Uploaded pictures stay readable: they're the
 * events' and venues' photos on public pages.
 *
 * Built on each request, from APP_URL.
 */
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const site = (process.env.APP_URL ?? '').replace(/\/+$/, '');
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/api/uploads/'],
        disallow: [
          '/admin',
          '/account',
          '/api/',
          '/matches',
          '/feedback',
          '/tell-a-friend',
          '/events/*/checkin',
          '/events/*/booked',
          '/verify-email',
          '/verify-mobile',
          '/reset-password',
          '/set-password',
          '/complete-signup',
          '/unsubscribe',
          '/optout',
        ],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
