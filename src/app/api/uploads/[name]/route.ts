import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { resolveUploadPath } from '@/lib/uploads';
import { withErrorHandling } from '@/lib/withErrorHandling';

// GET /api/uploads/:name — serves a stored blast image.
//
// PUBLIC, deliberately and necessarily: these URLs go inside marketing
// emails, and the recipient's mail client fetches them with no session. The
// filenames are 128 bits of randomness, so they aren't enumerable, and
// resolveUploadPath refuses anything that isn't one of our generated names.
//
// Served through a route handler rather than from public/ because the files
// live outside the deployed release directory (see src/lib/uploads.ts) so
// they survive deploys.
export const GET = withErrorHandling(async (_req: NextRequest, ctx: { params: Promise<{ name: string }> }) => {
  const params = await ctx.params;

  const full = await resolveUploadPath(params.name);
  if (!full) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = await fs.readFile(full);

  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': 'image/jpeg',
      // Content is immutable — the filename is derived from random bytes, so
      // a changed image is always a new URL. Long cache keeps repeated opens
      // of the same email off the server.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(data.length),
    },
  });
});
