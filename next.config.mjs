/**
 * Sent with every page and API response.
 *
 * - No other site may show FastMatch in a frame, so nobody can lay a fake
 *   page over a real one and trick a click (clickjacking). frame-ancestors is
 *   the modern form; X-Frame-Options covers older browsers.
 * - The rest of the Content-Security-Policy closes three doors the site never
 *   uses, which an injected bit of HTML could otherwise open: no plug-ins
 *   (<object>/<embed>: object-src 'none'), no <base href> sending the page's
 *   relative links elsewhere (base-uri 'self'), and no form posting what's
 *   typed into it to another site (form-action 'self'; every form here is
 *   sent by the page's own script to /api, and Stripe's payment page is
 *   reached by a link, not a form). Scripts and styles aren't restricted. The
 *   admin's email previews (a sandboxed srcDoc frame) carry these rules too:
 *   their <base target="_blank"> has no href, so base-uri doesn't touch it,
 *   and the sandbox already stops their forms and plug-ins. The YouTube video
 *   on the home page is a frame, which none of these rules cover.
 * - Strict-Transport-Security: once a browser has seen the site over HTTPS,
 *   it only ever uses HTTPS for it for a year, so nobody on a café's wifi can
 *   quietly serve the plain-HTTP version. Deliberately NOT includeSubDomains
 *   or preload: other names under the domain (Mailgun's link-tracking host,
 *   say) may only work over plain HTTP, and preloading can't easily be undone.
 *   Browsers ignore it over plain HTTP, so local testing on http://localhost
 *   is unaffected.
 * - nosniff: a file is only ever treated as the type the server says (an
 *   uploaded image can't be read as a page or a script).
 * - Other sites are only told a visitor came from FastMatch, never the page:
 *   reset, sign-up and unsubscribe links carry tokens in their address.
 */
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
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
