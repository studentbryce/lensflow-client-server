/**
 * LensFlow: pure, offline image preview processor.
 * No Supabase calls, database writes, or source-file modifications occur here.
 * Call only after server-side authorization and file ownership validation.
 */
import sharp from 'sharp';

const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_PREVIEW_EDGE = 1600;
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

export class ImagePreviewError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImagePreviewError';
  }
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

/**
 * Build the repeated diagonal proof watermark.
 *
 * Design choices:
 * - One fully opaque, solid light-grey fill (no outline or transparency).
 * - Wider horizontal/vertical gaps between repetitions for less obstruction.
 * - Tile width grows with the photographer name so long names do not overlap.
 *
 * This SVG is composited onto the *resized preview*, never the original.
 * Exported to allow precise, offline style regression tests.
 */
export function buildWatermarkSvg(width, height, text) {
  const safeText = escapeXml(text);
  const shortestEdge = Math.min(width, height);
  const fontSize = Math.max(16, Math.min(30, Math.round(shortestEdge * 0.026)));

  // Approximate the width of a bold sans-serif label. Leave a generous gap
  // after each repetition; do not depend on a fixed-width pattern tile.
  const estimatedTextWidth = Math.ceil(Array.from(text).length * fontSize * 0.64);
  const horizontalGap = Math.max(160, Math.round(shortestEdge * 0.20));
  const tileWidth = estimatedTextWidth + horizontalGap + 24;
  const tileHeight = Math.max(155, Math.round(shortestEdge * 0.20));
  const baseline = Math.round(tileHeight * 0.54);

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <pattern id="wm" width="${tileWidth}" height="${tileHeight}"
        patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
        <text x="12" y="${baseline}" font-family="sans-serif" font-size="${fontSize}"
          font-weight="700" fill="#E6E6E650">${safeText}</text>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#wm)" />
  </svg>`);
}

/**
 * Produce a reduced-size, visibly watermarked WebP preview.
 * @param {Buffer} sourceBuffer - Original image bytes (never modified).
 * @param {{watermarkText?: string, maxEdge?: number, quality?: number}} options
 * @returns {Promise<{buffer: Buffer, contentType: string, width: number, height: number, extension: string}>}
 */
export async function createWatermarkedPreview(sourceBuffer, options = {}) {
  if (!Buffer.isBuffer(sourceBuffer) || sourceBuffer.length === 0 || sourceBuffer.length > MAX_INPUT_BYTES) {
    throw new ImagePreviewError('Invalid image data or file exceeds the 25 MiB processing limit.');
  }
  const { watermarkText = 'LensFlow • Preview', maxEdge = MAX_PREVIEW_EDGE, quality = 78 } = options;
  if (typeof watermarkText !== 'string' || !watermarkText.trim() || watermarkText.length > 48) {
    throw new ImagePreviewError('Watermark must be 1–48 characters.');
  }
  if (!Number.isInteger(maxEdge) || maxEdge < 320 || maxEdge > MAX_PREVIEW_EDGE) {
    throw new ImagePreviewError('Preview dimension must be 320–1600 pixels.');
  }
  if (!Number.isInteger(quality) || quality < 45 || quality > 90) {
    throw new ImagePreviewError('Preview quality must be 45–90.');
  }
  try {
    const metadata = await sharp(sourceBuffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!ALLOWED_FORMATS.has(metadata.format)) {
      throw new ImagePreviewError('Only JPEG, PNG and WebP images are supported.');
    }
    // Sharp's rotate() applies EXIF orientation. Do not upscale small originals.
    const resized = await sharp(sourceBuffer, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      .toBuffer({ resolveWithObject: true });
    const { width, height } = resized.info;
    if (!width || !height) throw new ImagePreviewError('Unable to determine preview dimensions.');
    const buffer = await sharp(resized.data)
      .composite([{ input: buildWatermarkSvg(width, height, watermarkText.trim().replace(/\s+/g, ' ')), blend: 'over' }])
      .webp({ quality, effort: 4 })
      .toBuffer();
    return { buffer, contentType: 'image/webp', extension: 'webp', width, height };
  } catch (error) {
    if (error instanceof ImagePreviewError) throw error;
    throw new ImagePreviewError('Unable to process the supplied image.');
  }
}
