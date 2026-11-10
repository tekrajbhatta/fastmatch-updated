import sharp from 'sharp';

/**
 * The most pixels an uploaded image may have: 40 million, past any phone
 * camera (a 12-megapixel photo is 12 million). sharp's own default is about
 * 268 million, so a small file that unpacks into a vast image (a
 * "decompression bomb") could tie up the server's memory. Anything bigger
 * is refused as unreadable.
 */
export const MAX_INPUT_PIXELS = 40_000_000;

/**
 * Whether an image has any see-through pixels. Logos are often drawn on a
 * transparent background; converting one to JPEG (which has no transparency)
 * put it on a black square. An alpha channel alone isn't enough — plenty of
 * PNGs carry one that's fully opaque — so the pixels are checked.
 */
export async function hasTransparency(input: Buffer): Promise<boolean> {
  const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  if (!meta.hasAlpha) return false;
  const { isOpaque } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).stats();
  return !isOpaque;
}

/** The Content-Type for a stored upload, from its extension (src/lib/uploads.ts). */
export function uploadContentType(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1);
  return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
}
