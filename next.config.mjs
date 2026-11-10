/**
 * Sent with every page and API response.
 *
 * - No other site may show FastMatch in a frame, so nobody can lay a fake
 *   page over a real one and trick a click (clickjacking). frame-ancestors is
 *   the modern form; X-Frame-Options covers older browsers. This is the only
 *   rule in the Content-Security-Policy: it doesn't restrict scripts or styles.
 * - nosniff: a file is only ever treated as the type the server says (an
 *   uploaded image can't be read as a page or a script).
 * - Other sites are only told a visitor came from FastMatch, never the page:
 *   reset, sign-up and unsubscribe links carry tokens in their address.
 */
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // The site never uses the camera, microphone, location or the browser's
  // payment sheet (Stripe Checkout is its own page), so nothing it shows may.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // A page this site opens in a new tab can't reach back into it.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

/**
 * API answers carry members' own details (and the admin's member export), so
 * no browser or proxy may keep a copy: a later caching rule (say a
 * Cloudflare "cache everything") must never hand one member's answer to
 * another. Uploaded pictures are left out: they set their own long caching.
 */
const apiHeaders = [{ key: 'Cache-Control', value: 'private, no-store' }];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't announce what the site is built with.
  poweredByHeader: false,
  images: {
    // The picture resizer (/_next/image) only ever needs the logo and the
    // home page photos. Without this it would resize any address on the site
    // (uploads, API answers) for anyone who asks, which is where Next's
    // image-resizer security problems have been.
    localPatterns: [
      { pathname: '/logo.png', search: '' },
      { pathname: '/photos/**', search: '' },
    ],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/api/:path((?!uploads/).*)', headers: apiHeaders },
    ];
  },
};

export default nextConfig;
