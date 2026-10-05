import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import sharp from 'sharp';
import { requireAdmin } from '@/lib/auth';
import { withErrorHandling } from '@/lib/withErrorHandling';
import { ensureUploadDir, uploadDir, uploadUrl } from '@/lib/uploads';
import { hasTransparency } from '@/lib/imageFormat';

// Blast emails render at 520px wide; 1040 gives a sharp image on retina
// screens without shipping a 4MB phone photo to every recipient's inbox.
const MAX_WIDTH = 1040;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // what we accept BEFORE optimising
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// POST /api/admin/uploads — accepts one image, re-encodes it, stores it, and
// returns the URL to put in a blast's photoUrl (or an event's photo, or a
// venue's logo).
//
// Everything is re-encoded through sharp rather than stored as uploaded. That
// resizes an unbounded phone photo down to something an email can carry, and
// it also means the bytes we serve are ones sharp produced — an uploaded file
// that merely claims to be a PNG can't be stored and later served as script.
// EXIF (including GPS coordinates from a phone camera) is dropped in the
// process, which matters when the photos are of real attendees.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file was uploaded.' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'That image is larger than 10MB. Please use a smaller one.' }, { status: 400 });
  }
  if (file.type && !ACCEPTED.includes(file.type)) {
    return NextResponse.json({ error: 'Please upload a JPEG, PNG or WebP image.' }, { status: 400 });
  }

  const input = Buffer.from(await file.arrayBuffer());

  let output: Buffer;
  let ext: 'jpg' | 'png';
  try {
    // An image with see-through parts (a logo, usually) stays a PNG: as a
    // JPEG, which has no transparency, it came out on a black square.
    // Everything else is a JPEG, as before — much smaller for photos.
    const transparent = await hasTransparency(input);
    const resized = sharp(input)
      .rotate() // honour EXIF orientation before the orientation tag is stripped
      .resize({ width: MAX_WIDTH, withoutEnlargement: true });
    output = transparent
      ? await resized.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
      : await resized.jpeg({ quality: 82, progressive: true }).toBuffer();
    ext = transparent ? 'png' : 'jpg';
  } catch {
    // sharp refuses anything that isn't really an image, whatever it claimed.
    return NextResponse.json({ error: 'That file could not be read as an image.' }, { status: 400 });
  }

  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  await ensureUploadDir();
  await fs.writeFile(path.join(uploadDir(), name), output);

  return NextResponse.json({ url: uploadUrl(name), name, bytes: output.length });
});
