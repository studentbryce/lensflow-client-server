/** In-memory social export. Originals/previews are never overwritten or uploaded. */
import sharp from 'sharp';

export const SOCIAL_MAX_EDGE = 1080;
export const SOCIAL_JPEG_QUALITY = 85;
export const SOCIAL_MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);

export class SocialImageError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function socialFileName(name) {
  const base = String(name || 'lensflow-photo')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '-')
    .trim().slice(0, 110) || 'lensflow-photo';
  return `${base}-social.jpg`;
}

export async function createSocialJpeg(input) {
  if (!Buffer.isBuffer(input) || input.length === 0 || input.length > SOCIAL_MAX_INPUT_BYTES) {
    throw new SocialImageError(413, 'IMAGE_TOO_LARGE', 'This photo is too large to optimize. Please download the original instead.');
  }
  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
    const meta = await image.metadata();
    if (!ACCEPTED_FORMATS.has(meta.format)) {
      throw new SocialImageError(415, 'IMAGE_FORMAT_UNSUPPORTED', 'This photo format cannot be optimized. Please download the original instead.');
    }
    // Auto-orient, fit inside 1080 x 1080, never upscale, convert to sRGB,
    // strip metadata (including location EXIF), and encode as JPEG.
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: SOCIAL_MAX_EDGE, height: SOCIAL_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .toColourspace('srgb')
      .jpeg({ quality: SOCIAL_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch (error) {
    if (error instanceof SocialImageError) throw error;
    throw new SocialImageError(422, 'IMAGE_PROCESSING_FAILED', 'This photo could not be optimized. Please download the original instead.');
  }
}
