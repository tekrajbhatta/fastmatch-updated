import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/staff';

/**
 * GET /admin/ad-maker — Gil's Ad Maker (Nov), for staff: Gil and franchisees
 * (his note: "These should be available to franchisees also"). "Make an ad"
 * on an event opens it filled in (src/lib/adMaker.ts).
 *
 * ad-maker.html beside this file is Gil's page exactly as he sent it
 * (fastmatch-ad-maker-standalone.html): a newer version just replaces it. It
 * draws the images in the browser and sends nothing anywhere; it loads its
 * zip tool from cdnjs and its fonts from Google Fonts. Not in public/,
 * where anyone could open it: its starting points carry Gil's discount codes.
 *
 * A route rather than a page, so it's served whole, without the site's
 * header around it. Middleware sends a logged-out visitor to log in first.
 */
const FILE = path.join(process.cwd(), 'src/app/admin/ad-maker/ad-maker.html');
let page: Promise<{ html: Buffer; etag: string }> | null = null;
const load = () => (page ??= readFile(FILE).then((html) => ({ html, etag: `"${createHash('sha1').update(html).digest('hex')}"` })));

export async function GET(req: NextRequest) {
  // Anyone else goes to the admin, which tells a member it's for staff.
  if (!(await requireStaff(req))) return NextResponse.redirect(new URL('/admin', req.url));

  const { html, etag } = await load();
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    // Kept by this browser only, and checked with the server each time.
    'Cache-Control': 'private, no-cache',
    ETag: etag,
    'X-Robots-Tag': 'noindex',
  };
  if (req.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers });
  return new NextResponse(new Uint8Array(html), { headers });
}
