import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { hasTransparency, uploadContentType } from '@/lib/imageFormat';

/** Transparent logos stay PNG instead of landing on a black square as JPEG. */
const image = (alpha: number | null, format: 'png' | 'jpeg' = 'png') =>
  sharp({ create: { width: 8, height: 8, channels: alpha === null ? 3 : 4, background: alpha === null ? { r: 200, g: 0, b: 90 } : { r: 200, g: 0, b: 90, alpha } } })
    .toFormat(format)
    .toBuffer();

describe('hasTransparency', () => {
  it('spots see-through pixels', async () => {
    expect(await hasTransparency(await image(0))).toBe(true);
    expect(await hasTransparency(await image(0.5))).toBe(true);
  });

  it('isn’t fooled by an alpha channel that’s fully opaque, or a photo', async () => {
    expect(await hasTransparency(await image(1))).toBe(false);
    expect(await hasTransparency(await image(null))).toBe(false);
    expect(await hasTransparency(await image(null, 'jpeg'))).toBe(false);
  });
});

describe('uploadContentType', () => {
  it('serves each stored file as what it is', () => {
    expect(uploadContentType('0123456789abcdef0123456789abcdef.png')).toBe('image/png');
    expect(uploadContentType('0123456789abcdef0123456789abcdef.jpg')).toBe('image/jpeg');
    expect(uploadContentType('0123456789abcdef0123456789abcdef.webp')).toBe('image/webp');
  });
});
