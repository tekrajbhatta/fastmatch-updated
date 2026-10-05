import sharp from 'sharp';

/**
 * Whether an image has any see-through pixels. Logos are often drawn on a
 * transparent background; converting one to JPEG (which has no transparency)
 * put it on a black square. An alpha channel alone isn't enough — plenty of
 * PNGs carry one that's fully opaque — so the pixels are checked.
 */
export async function hasTransparency(input: Buffer): Promise<boolean> {
  const meta = await sharp(input).metadata();
  if (!meta.hasAlpha) return false;
  const { isOpaque } = await sharp(input).stats();
  return !isOpaque;
}

/** The Content-Type for a stored upload, from its extension (src/lib/uploads.ts). */
export function uploadContentType(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1);
  return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
}
