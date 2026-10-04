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
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
